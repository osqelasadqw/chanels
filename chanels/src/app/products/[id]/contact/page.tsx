"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { db } from "@/firebase/config";
import { doc, getDoc, addDoc, collection, query, where, getDocs } from "firebase/firestore";
import { Product } from "@/types/product";
import { ref, push } from "firebase/database";
import { rtdb } from "@/firebase/config";

interface ContactPageProps {
  params: {
    id: string;
  };
}

export default function ContactPage({ params }: ContactPageProps) {
  const pathname = usePathname();
  const productId = pathname.split('/').filter(Boolean).at(-2) || '';
  
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatingChat, setCreatingChat] = useState(false);
  const { user } = useAuth();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch product details
  useEffect(() => {
    const fetchProduct = async () => {
      try {
        setLoading(true);
        setError(null);

        const productDocRef = doc(db, "products", productId);
        const productDoc = await getDoc(productDocRef);

        if (productDoc.exists()) {
          setProduct({
            id: productDoc.id,
            ...productDoc.data()
          } as Product);
        } else {
          setError("Product not found");
        }
      } catch (err) {
        console.error("Error fetching product:", err);
        setError("Failed to load product details");
      } finally {
        setLoading(false);
      }
    };

    if (productId) {
      fetchProduct();
    }
  }, [productId]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push("/");
    }
  }, [user, loading, router]);

  const handleContactSeller = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !user.id) {
      router.push('/login');
      return;
    }

    if (!product) {
      return;
    }

    try {
      setIsSubmitting(true);
      console.log("Starting contact seller process...");
      console.log("Current user ID:", user.id);
      console.log("Seller ID:", product.userId);

      // შევამოწმოთ არსებობს თუ არა ჩატი ერთი where პირობით ინდექსის შეცდომის თავიდან ასაცილებლად
      const chatsQuery = query(
        collection(db, "chats"),
        where("productId", "==", product.id)
      );

      console.log("Checking if chat exists for product:", product.id);
      const existingChats = await getDocs(chatsQuery);
      let chatId;
      
      // ფილტრაცია კოდში - შევამოწმოთ არსებობს თუ არა ჩატი იმავე მომხმარებლებით
      const existingChat = existingChats.docs.find(doc => {
        const chatData = doc.data();
        const participants = chatData.participants || [];
        return participants.includes(user.id);
      });

      if (existingChat) {
        chatId = existingChat.id;
        console.log("Found existing chat with product seller:", chatId);
      } else {
        console.log("Creating new chat...");
        
        // გენერირება ტრანზაქციის ID-ის
        const transactionId = Math.floor(1000000 + Math.random() * 9000000);
        const paymentMethod = "stripe"; // ნაგულისხმევად Stripe
        
        const chatData = {
          productId: product.id,
          productName: product.displayName,
          productImage: product.imageUrls && product.imageUrls.length > 0 ? product.imageUrls[0] : "",
          participants: [user.id, product.userId],
          participantNames: {
            [user.id]: user.name || user.email?.split('@')[0] || "User",
            [product.userId]: product.userEmail?.split('@')[0] || "Seller"
          },
          participantPhotos: {
            [user.id]: user.photoURL || "",
            [product.userId]: "" // We don't have seller's photo
          },
          productPrice: product.price,
          lastMessage: {
            text: `Transaction status: Payment required for ${product.displayName}`,
            senderId: user.id,
            timestamp: Date.now()
          },
          createdAt: Date.now(),
          updatedAt: Date.now(),
          unreadCount: {
            [product.userId]: 1, // Unread for seller
            [user.id]: 0 // Read for buyer
          },
          isActive: true,
          adminJoined: false,
          transactionId: transactionId,
          transactionStatus: "pending_payment"
        };
        
        // Create the chat document
        const chatRef = await addDoc(collection(db, "chats"), chatData);
        chatId = chatRef.id;
        console.log("New chat created with ID:", chatId);
        
        // Add transaction status message to Firestore subcollection
        const messageData = {
          text: `
Transaction status:
The terms of the transaction were confirmed. When you send your payment, the seller will be notified, and will need to transfer the account login details based on the agreed upon terms. If the seller does not respond, or breaks the rules, you can call upon the escrow agent (button below).

Transaction ID: ${transactionId}
Transaction Amount: $${product.price}
Payment Method: Visa/MasterCard`,
          senderId: user.id,
          senderName: user.name || user.email?.split('@')[0] || "User",
          timestamp: Date.now(),
          isSystem: true,
          isPurchaseRequest: true,
          isTransactionStatus: true,
          purchaseDetails: {
            transactionId: transactionId,
            amount: product.price,
            paymentMethod: "Visa/MasterCard",
            productName: product.displayName,
            productId: product.id,
            needsPayment: true,
            termsConfirmed: true,
            escrowAgent: true,
            showPayButton: true
          },
          read: {
            [user.id]: true,     // Read by sender
            [product.userId]: false    // Not read by recipient
          }
        };
        
        await addDoc(collection(db, "chats", chatId, "messages"), messageData);
        
        // Add message to Realtime Database
        const rtdbMessagesRef = ref(rtdb, `messages/${chatId}`);
        await push(rtdbMessagesRef, {
          text: messageData.text,
          senderId: user.id,
          senderName: user.name || user.email?.split('@')[0] || "User",
          senderPhotoURL: user.photoURL || null,
          timestamp: Date.now(),
          isSystem: true,
          isPurchaseRequest: true,
          isTransactionStatus: true,
          paymentMethod: "Visa/MasterCard",
          transactionId: transactionId,
          amount: product.price,
          purchaseDetails: messageData.purchaseDetails
        });
        
        console.log("First message added to chat");
      }
      
      // Navigate to the chat
      router.push(`/my-chats?chatId=${chatId}`);
      
    } catch (error) {
      console.error("Error creating chat:", error);
      setError("Failed to send message. Please try again later.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="bg-red-100 text-red-700 p-6 rounded-lg">
        <h2 className="text-xl font-bold mb-2">Error</h2>
        <p>{error || "Product not found"}</p>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect due to the useEffect
  }

  // Don't allow contacting yourself
  if (user.id === product.userId) {
    return (
      <div className="bg-yellow-100 text-yellow-800 p-6 rounded-lg">
        <h2 className="text-xl font-bold mb-2">Notice</h2>
        <p>This is your own listing. You cannot contact yourself.</p>
        <Link 
          href={`/products/${product.id}`}
          className="mt-4 inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          Back to Listing
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h1 className="text-2xl font-bold mb-6">Purchase Channel</h1>
      
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">{product.displayName}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="px-2 py-1 bg-gray-100 text-xs font-semibold rounded">{product.platform}</span>
              <span className="text-sm text-gray-500">{product.category}</span>
            </div>
          </div>
          <div className="text-xl font-bold text-green-600">${product.price}</div>
        </div>
        <Link 
          href={`/products/${product.id}`}
          className="text-blue-600 hover:underline text-sm"
        >
          View full listing
        </Link>
      </div>
      
      <div className="mb-6">
        <h2 className="text-lg font-bold mb-4">About the Purchase Process</h2>
        <ul className="space-y-2 text-gray-700">
          <li className="flex items-start gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>When you click "Continue to Payment", a transaction will be set up for this channel purchase.</span>
          </li>
          <li className="flex items-start gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>You can ask questions about the channel, negotiate the price, and discuss the details.</span>
          </li>
          <li className="flex items-start gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>When ready to proceed, you can request an escrow agent to help facilitate the transaction safely.</span>
          </li>
        </ul>
      </div>
      
      <div className="flex justify-between">
        <Link 
          href={`/products/${product.id}`}
          className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
        >
          Back to Listing
        </Link>
        
        <button
          onClick={handleContactSeller}
          disabled={isSubmitting}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {isSubmitting ? "Processing..." : "Continue to Payment"}
        </button>
      </div>
    </div>
  );
} 