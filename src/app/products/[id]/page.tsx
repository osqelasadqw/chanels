"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { db } from "@/firebase/config";
import { doc, getDoc, addDoc, collection, query, where, getDocs, deleteDoc, setDoc, updateDoc } from "firebase/firestore";
import { Product } from "@/types/product";
import { ref, push, get } from "firebase/database";
import { rtdb } from "@/firebase/config";
import { getChannelLogo, extractChannelIdFromUrl } from "@/firebase/channelLogos";

interface ProductPageProps {
  params: {
    id: string;
  };
}

export default function ProductPage({ params }: ProductPageProps) {
  const pathname = usePathname();
  const productId = pathname.split('/').pop() || '';
  
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [youtubeDataLoaded, setYoutubeDataLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contactLoading, setContactLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        setLoading(true);
        setError(null);
        setYoutubeDataLoaded(false);

        const productDocRef = doc(db, "products", productId);
        const productDoc = await getDoc(productDocRef);

        if (productDoc.exists()) {
          const productData = productDoc.data();
          const productWithId = {
            id: productDoc.id,
            ...productData
          } as Product;
          
          // თუ ეს YouTube არხია და არსებობს არხის ID, შევამოწმოთ channelLogos კოლექციაში
          if (productData.platform === "YouTube") {
            // თუ არხის ID უკვე არის პროდუქტის მონაცემებში
            if (productData.channelId) {
              try {
                const logoData = await getChannelLogo(productData.channelId);
                if (logoData && logoData.logoUrl) {
                  // განვაახლოთ ლოგოს URL ჩვენს პროდუქტის ობიექტში
                  productWithId.channelLogo = logoData.logoUrl;
                  
                  // განვაახლოთ ბაზაშიც, თუ საჭიროა
                  if (productData.channelLogo !== logoData.logoUrl) {
                    await updateDoc(productDocRef, {
                      channelLogo: logoData.logoUrl
                    });
                  }
                }
              } catch (logoErr) {
                console.error("Error fetching channel logo:", logoErr);
                // განვაგრძოთ ჩვეულებრივად, ლოგოს გარეშეც თუ შეცდომაა
              }
            } 
            // თუ არხის ID არაა პროდუქტში, მაგრამ არის ლინკი
            else if (productData.accountLink) {
              const channelId = extractChannelIdFromUrl(productData.accountLink);
              if (channelId) {
                try {
                  // შევამოწმოთ არის თუ არა ლოგო channelLogos კოლექციაში
                  const logoData = await getChannelLogo(channelId);
                  if (logoData && logoData.logoUrl) {
                    // განვაახლოთ ლოგოს URL ჩვენს პროდუქტის ობიექტში
                    productWithId.channelLogo = logoData.logoUrl;
                    
                    // განვაახლოთ ბაზაშიც
                    await updateDoc(productDocRef, {
                      channelLogo: logoData.logoUrl,
                      channelId: channelId
                    });
                  }
                } catch (logoErr) {
                  console.error("Error fetching channel logo:", logoErr);
                }
              }
            }
          }
          
          setProduct(productWithId);
          
          // Check if essential YouTube data is loaded
          const hasLogo = !!productWithId.channelLogo || (productWithId.imageUrls && productWithId.imageUrls.length > 0);
          const hasSubscribers = productWithId.subscribers !== undefined;
          const hasName = !!productWithId.displayName;
          
          setYoutubeDataLoaded(!!(hasLogo && hasSubscribers && hasName));
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

  useEffect(() => {
    const checkIfFavorite = async () => {
      if (!user || !productId) return;
      setFavoriteLoading(true);
      try {
        const favoriteDocRef = doc(db, "users", user.id, "favorites", productId);
        const favoriteDoc = await getDoc(favoriteDocRef);
        setIsFavorite(favoriteDoc.exists());
      } catch (err) {
        console.error("Error checking favorite status:", err);
        // Optionally set an error state here
      } finally {
        setFavoriteLoading(false);
      }
    };

    checkIfFavorite();
  }, [user, productId]);

  const handleToggleFavorite = async () => {
    if (!user) {
      // alert("Please log in to manage your favorites.");
      router.push('/login');
      return;
    }
    if (!product) return;

    setFavoriteLoading(true);
    const favoriteDocRef = doc(db, "users", user.id, "favorites", product.id);

    try {
      if (isFavorite) {
        await deleteDoc(favoriteDocRef);
        setIsFavorite(false);
        // alert("Removed from favorites!");
      } else {
        await setDoc(favoriteDocRef, { 
          productId: product.id, 
          addedAt: Date.now(),
          // Storing some basic product info for easier display on favorites page
          productName: product.displayName,
          productPrice: product.price,
          productImage: product.imageUrls && product.imageUrls.length > 0 ? product.imageUrls[0] : ""
        });
        setIsFavorite(true);
        // alert("Added to favorites!");
      }
    } catch (err) {
      console.error("Error updating favorite status:", err);
      // alert("Failed to update favorites. Please try again.");
    } finally {
      setFavoriteLoading(false);
    }
  };

  const handleContactSeller = async () => {
    if (!user) {
      router.push('/login');
      return;
    }

    if (!product) return;

    // Don't allow contacting yourself
    if (user.id === product.userId) {
      return;
    }

    try {
      setContactLoading(true);
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
        // Chat already exists, use it
        chatId = existingChat.id;
        console.log("Found existing chat:", chatId);
        
        // შევამოწმოთ არსებობს თუ არა შეტყობინებები ჩატში
        try {
          const rtdbMessagesRef = ref(rtdb, `messages/${chatId}`);
          const messagesSnapshot = await get(rtdbMessagesRef);
          
          if (!messagesSnapshot.exists()) {
            console.log("No messages found in existing chat. Adding initial purchase message.");
            
            // გავაგზავნოთ საწყისი შეტყობინება, თუ ჩატი ცარიელია - გადახდის სტატუსით
            const transactionId = Math.floor(1000000 + Math.random() * 9000000);
            const paymentMethod = "stripe";
            
            await push(rtdbMessagesRef, {
              text: `
Transaction status:
The terms of the transaction were confirmed. When you send your payment, the seller will be notified, and will need to transfer the account login details based on the agreed upon terms. If the seller does not respond, or breaks the rules, you can call upon the escrow agent (button below).

Transaction ID: ${transactionId}
Transaction Amount: $${product.price}
Payment Method: Visa/MasterCard`,
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
              }
            });
            
            console.log("Initial message added to existing empty chat");
            
            // განვაახლოთ lastMessage ჩატში
            const chatDocRef = doc(db, "chats", chatId);
            await updateDoc(chatDocRef, {
              lastMessage: {
                text: `Transaction status: Payment required for ${product.displayName}`,
                senderId: user.id,
                timestamp: Date.now()
              },
              adminJoined: false // ადმინი მხოლოდ გადახდის შემდეგ შემოვა ჩატში
            });
          } else {
            console.log("Existing chat already has messages, not adding initial message");
          }
        } catch (rtdbError) {
          console.error("Error checking for messages in RTDB:", rtdbError);
        }
      } else {
        console.log("No existing chat found, creating new one...");
        
        // Make sure we have valid user IDs
        const buyerId = user.id;
        const sellerId = product.userId;
        
        console.log("Verified buyer ID:", buyerId);
        console.log("Verified seller ID:", sellerId);
        
        if (!buyerId || !sellerId) {
          console.error("Missing user IDs", { buyerId, sellerId });
          throw new Error("Missing user IDs");
        }

        // Create a new chat
        const chatData = {
          productId: product.id,
          productName: product.displayName,
          productImage: product.channelLogo || (product.imageUrls && product.imageUrls.length > 0 ? product.imageUrls[0] : ""),
          participants: [buyerId, sellerId],
          participantNames: {
            [buyerId]: user.name || user.email?.split('@')[0] || "User",
            [sellerId]: product.userEmail?.split('@')[0] || "Seller"
          },
          participantPhotos: {
            [buyerId]: user.photoURL || "",
            [sellerId]: "" // Assuming no photo available
          },
          productPrice: product.price,
          lastMessage: `Transaction status: Payment required for ${product.displayName}`,
          lastMessageTimestamp: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          unreadCount: {
            [sellerId]: 1, // Unread for seller
            [buyerId]: 0   // Read for buyer
          },
          isActive: true,
          adminJoined: false
        };

        try {
          // Explicitly create the chat document
          const chatRef = doc(collection(db, "chats"));
          chatId = chatRef.id;
          
          // Set the document with the ID
          await setDoc(chatRef, chatData);
          console.log("Created new chat with ID:", chatId);
          
          // Generate transaction ID
          const transactionId = Math.floor(1000000 + Math.random() * 9000000);
          console.log("Generated transaction ID:", transactionId);
          
          // საგადახდო მეთოდის და escrow მომსახურების გამოყენების განსაზღვრა
          const paymentMethod = "stripe"; // ნაგულისხმევად Stripe
          const useEscrow = true;        // ნაგულისხმევად ჩართულია escrow მომსახურება
          
          // Create the purchase message object with transaction status styled like in the image
          const purchaseMessage = {
            senderId: buyerId,
            senderName: user.name || user.email?.split('@')[0] || "User",
            text: `
Transaction status:
The terms of the transaction were confirmed. When you send your payment, the seller will be notified, and will need to transfer the account login details based on the agreed upon terms. If the seller does not respond, or breaks the rules, you can call upon the escrow agent (button below).

Transaction ID: ${transactionId}
Transaction Amount: $${product.price}
Payment Method: ${paymentMethod === 'stripe' ? 'Visa/MasterCard' : 'Bitcoin'}`,
            timestamp: Date.now(),
            isSystemMessage: true,
            isPurchaseRequest: true,
            read: {
              [buyerId]: true,     // Read by sender
              [sellerId]: false    // Not read by recipient
            },
            purchaseDetails: {
              transactionId: transactionId,
              amount: product.price,
              paymentMethod: paymentMethod === 'stripe' ? 'Visa/MasterCard' : 'Bitcoin',
              productName: product.displayName,
              productId: product.id,
              needsPayment: true,
              termsConfirmed: true,
              escrowAgent: true,
              showPayButton: true
            }
          };
          
          // Create the messages subcollection and add the first message
          const messageRef = doc(collection(db, "chats", chatId, "messages"));
          console.log("Adding purchase message to chat...");
          await setDoc(messageRef, purchaseMessage);
          console.log("Purchase message added successfully");
          
          // დავამატოთ მესიჯი რეალურ დროის ბაზაშიც
          try {
            const rtdbMessagesRef = ref(rtdb, `messages/${chatId}/${messageRef.id}`);
            await push(ref(rtdb, `messages/${chatId}`), {
              text: purchaseMessage.text,
              senderId: buyerId,
              senderName: user.name || user.email?.split('@')[0] || "User",
              timestamp: Date.now(),
              isSystem: true,
              isPurchaseRequest: true,
              isTransactionStatus: true,
              paymentMethod: paymentMethod === 'stripe' ? 'Visa/MasterCard' : 'Bitcoin',
              transactionId: transactionId,
              amount: product.price
            });
            console.log("Message added to Realtime Database");
          } catch (rtdbError) {
            console.error("Error adding message to RTDB:", rtdbError);
          }
          
          // Update the buyer's chatList - CRITICAL PORTION
          console.log("Attempting to create buyer's chat list entry");
          try {
            const buyerChatListRef = doc(db, "users", buyerId, "chatList", chatId);
            const buyerChatData = {
              chatId: chatId,
              productId: product.id,
              productName: product.displayName,
              productImage: product.imageUrls && product.imageUrls.length > 0 ? product.imageUrls[0] : "",
              otherUserId: sellerId,
              otherUserName: product.userEmail?.split('@')[0] || "Seller",
              lastMessage: `Transaction status: Payment required for ${product.displayName}`,
              lastMessageTimestamp: Date.now(),
              unreadCount: 0,
              updatedAt: Date.now()
            };
            
            await setDoc(buyerChatListRef, buyerChatData);
            console.log("Successfully added chat to buyer's chat list");
          } catch (buyerChatError) {
            console.error("Error creating buyer's chat list entry:", buyerChatError);
            // Still continue even if this fails
          }
          
          // Update the seller's chatList
          console.log("Attempting to create seller's chat list entry");
          try {
            const sellerChatListRef = doc(db, "users", sellerId, "chatList", chatId);
            const sellerChatData = {
              chatId: chatId,
              productId: product.id,
              productName: product.displayName,
              productImage: product.imageUrls && product.imageUrls.length > 0 ? product.imageUrls[0] : "",
              otherUserId: buyerId,
              otherUserName: user.name || user.email?.split('@')[0] || "User",
              lastMessage: `Transaction status: Payment required for ${product.displayName}`,
              lastMessageTimestamp: Date.now(),
              unreadCount: 1,
              updatedAt: Date.now()
            };
            
            await setDoc(sellerChatListRef, sellerChatData);
            console.log("Successfully added chat to seller's chat list");
          } catch (sellerChatError) {
            console.error("Error creating seller's chat list entry:", sellerChatError);
            // Still continue even if this fails
          }
          
        } catch (chatError) {
          console.error("Error in chat creation process:", chatError);
          throw chatError; // Re-throw to be caught by the outer catch
        }
      }
      
      // Explicitly check and create buyer's chat list entry if it doesn't exist yet
      // This is a fallback in case the above creation failed
      try {
        const buyerChatEntryRef = doc(db, "users", user.id, "chatList", chatId);
        const buyerChatEntry = await getDoc(buyerChatEntryRef);
        
        if (!buyerChatEntry.exists()) {
          console.log("Fallback: Creating missing buyer chat list entry");
          await setDoc(buyerChatEntryRef, {
            chatId: chatId,
            productId: product.id,
            productName: product.displayName,
            productImage: product.imageUrls && product.imageUrls.length > 0 ? product.imageUrls[0] : "",
            otherUserId: product.userId,
            otherUserName: product.userEmail?.split('@')[0] || "Seller",
            lastMessage: `Transaction status: Payment required for ${product.displayName}`,
            lastMessageTimestamp: Date.now(),
            unreadCount: 0,
            updatedAt: Date.now()
          });
          console.log("Fallback: Successfully created missing buyer chat entry");
        }
      } catch (fallbackError) {
        console.error("Fallback error:", fallbackError);
      }
      
      console.log("Redirecting to chat page with chatId:", chatId);
      // Redirect to the chat
      router.push(`/my-chats?chatId=${chatId}`);
    } catch (err) {
      console.error("Error in contact seller function:", err);
    } finally {
      setContactLoading(false);
    }
  };
  
  const handleDeleteListing = async () => {
    if (!user || !product) return;
    
    if (user.id !== product.userId) {
      // alert("You can only delete your own listings");
      return;
    }
    
    const confirmDelete = window.confirm("Are you sure you want to delete this listing?");
    if (!confirmDelete) return;
    
    try {
      setDeleteLoading(true);
      await deleteDoc(doc(db, "products", product.id));
      // alert("Listing deleted successfully");
      router.push("/my-products");
    } catch (err) {
      console.error("Error deleting listing:", err);
      // alert("Failed to delete listing. Please try again.");
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full min-h-screen bg-gray-100 flex flex-col">
        <div className="flex-grow flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-500 rounded-full border-t-transparent"></div>
        </div>
        
        {/* Footer */}
        <footer className="bg-gray-900 text-white py-4 px-6 mt-auto">
          <div className="container mx-auto flex flex-col md:flex-row justify-between items-center">
            <div className="mb-4 md:mb-0">
              <div className="text-sm">MateSwap LP</div>
              <div className="text-xs text-gray-400">Address: 85 First Floor Great Portland Street, London, England, W1W 7LT</div>
            </div>
            <div className="flex space-x-6">
              <Link href="/terms" className="text-sm hover:text-gray-300 transition-colors">
                Terms and Conditions
              </Link>
              <Link href="/privacy" className="text-sm hover:text-gray-300 transition-colors">
                Privacy Policy
              </Link>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="w-full min-h-screen bg-gray-100 flex flex-col">
        <div className="flex-grow flex items-center justify-center p-4">
          <div className="max-w-4xl w-full bg-red-50 text-red-700 p-8 rounded-lg shadow-md">
        <h2 className="text-2xl font-bold mb-4">Error</h2>
        <p className="text-lg mb-6">{error || "Product not found"}</p>
          </div>
        </div>
        
        {/* Footer */}
        <footer className="bg-gray-900 text-white py-4 px-6 mt-auto">
          <div className="container mx-auto flex flex-col md:flex-row justify-between items-center">
            <div className="mb-4 md:mb-0">
              <div className="text-sm">MateSwap LP</div>
              <div className="text-xs text-gray-400">Address: 85 First Floor Great Portland Street, London, England, W1W 7LT</div>
            </div>
            <div className="flex space-x-6">
              <Link href="/terms" className="text-sm hover:text-gray-300 transition-colors">
                Terms and Conditions
              </Link>
              <Link href="/privacy" className="text-sm hover:text-gray-300 transition-colors">
                Privacy Policy
              </Link>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-gray-100 flex flex-col">
      <div className="w-full px-3 py-4 flex-grow">
        {/* Header info */}
        <div className="flex justify-between items-center mb-3 text-xs text-gray-500 px-2">
          <div className="flex items-center space-x-2">
            <span>Listed: {product.createdAt ? new Date(product.createdAt).toLocaleDateString() : 'Recently'}</span>
            <span>|</span>
            <span>Updated: {product.createdAt ? new Date(product.createdAt).toLocaleDateString() : 'Recently'}</span>
            <span>|</span>
          </div>
          
          {user && user.id === product.userId && (
            <button 
              onClick={handleDeleteListing}
              disabled={deleteLoading}
              className="text-gray-600 hover:text-red-500 flex items-center text-xs"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              This channel is mine, delete listing!
            </button>
          )}
        </div>
        
        {/* Main content - 3 column row */}
        <div className="w-full mb-6">
          <div className="flex flex-col lg:flex-row gap-5">
            {/* Left column - Logo (1/4) */}
            <div className="lg:w-1/4">
              <div className="rounded-full overflow-hidden w-48 h-48 mx-auto mb-6 border-4 border-gray-200">
                {/* არხის ლოგოს ჩვენება, თუ არსებობს, წინააღმდეგ შემთხვევაში ჩვეულებრივი სურათი */}
                {product.channelLogo ? (
                  <Image 
                    src={product.channelLogo} 
                    alt={`${product.displayName} logo`}
                    width={192}
                    height={192}
                    className="w-full h-full object-cover"
                  />
                ) : product.imageUrls && product.imageUrls.length > 0 ? (
                  <Image 
                    src={product.imageUrls[0]} 
                    alt={product.displayName}
                    width={192}
                    height={192}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                )}
              </div>
              
              <div className="flex gap-2 mt-3">
                <button 
                  onClick={handleContactSeller}
                  disabled={contactLoading || !product || !youtubeDataLoaded}
                  className={`flex-1 py-1.5 px-2 ${youtubeDataLoaded ? 'bg-black hover:bg-gray-800' : 'bg-gray-400 cursor-not-allowed'} text-white font-medium rounded-full text-sm transition-colors`}
                >
                  {contactLoading ? 'Processing...' : !youtubeDataLoaded ? 'Loading data...' : 'Purchase Channel'}
                </button>
                <button 
                  onClick={handleToggleFavorite}
                  disabled={favoriteLoading || !product || !youtubeDataLoaded}
                  className={`flex-1 py-1.5 px-2 border font-medium rounded-full text-sm transition-colors ${
                    !youtubeDataLoaded 
                      ? 'border-gray-300 bg-gray-100 text-gray-400 cursor-not-allowed'
                      : isFavorite 
                      ? 'bg-pink-500 text-white border-pink-500 hover:bg-pink-600' 
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {favoriteLoading ? 'Updating...' : !youtubeDataLoaded ? 'Loading...' : isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                </button>
              </div>
              
              {!youtubeDataLoaded && (
                <div className="mt-3 text-center text-xs text-gray-500">
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-blue-500"></div>
                    Loading channel data from YouTube...
                  </div>
                </div>
              )}
            </div>
            
            {/* Middle column - Channel info (1/2) */}
            <div className="lg:w-1/2">
              <div className="flex flex-col xl:flex-row xl:justify-between">
                <div className="mb-4 xl:mb-0">
                  <h1 className="text-3xl font-bold text-gray-900 mb-1">{product.displayName}</h1>
                  <div className="text-gray-600 mb-4 text-base">
                    {product.category} / <a href={product.accountLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{product.accountLink}</a>
                  </div>
                  
                  <div className="border-l-4 border-blue-500 pl-4 space-y-1 mb-6">
                    <div className="text-gray-700 text-base">{product.subscribers?.toLocaleString() || 0} — subscribers</div>
                    <div className="text-gray-700 text-base">${product.monthlyIncome || 0} — income (month)</div>
                    <div className="text-gray-700 text-base">${product.monthlyExpenses || 0} — expense (month)</div>
                  </div>
                  
                  <div className="text-4xl font-bold text-gray-900 mb-4">$ {product.price}</div>
                </div>
              </div>
              
              <div className="mt-3 flex items-center space-x-2">
                {(product as any).isVerified && (
                  <div className="bg-gray-100 text-gray-800 px-2 py-0.5 rounded-full font-medium flex items-center text-xs">
                    <svg className="w-3 h-3 mr-1 text-green-600" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path>
                    </svg>
                    PASS
                  </div>
                )}
                {(product as any).isVIP && (
                  <div className="bg-gray-800 text-white px-2 py-0.5 rounded-full font-medium text-xs">VIP</div>
                )}
                {(product as any).discount && (
                  <div className="bg-gray-800 text-white px-2 py-0.5 rounded-full font-medium text-xs">-{(product as any).discount}%</div>
                )}
              </div>
            </div>

            {/* Right column - Attached images (1/4) */}
            <div className="lg:w-1/4 fixed top-1/2 transform -translate-y-1/2 right-6">
              <h2 className="text-xl font-bold text-gray-800 mb-3">Attached images:</h2>
              {product.imageUrls && product.imageUrls.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {product.imageUrls.map((url, index) => (
                    <div 
                      key={index} 
                      className="aspect-square rounded-md overflow-hidden border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => setSelectedImage(url)}
                    >
                      <Image
                        src={url}
                        alt={`${product.displayName} - Image ${index + 1}`}
                        width={150}
                        height={150}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-500 text-center py-6">No images attached</div>
              )}
            </div>
          </div>
        </div>
        
        {/* Description section (Full width, below the 3-column row) */}
        <div className="w-full mt-6">
          <h2 className="text-xl font-bold text-gray-800 mb-3">Description:</h2>
          <div className="text-gray-700 text-base">
            {/* ვამუშავებთ აღწერის ტექსტს მარტივი ფორმატით */}
            {product.description && (
              <>
                {/* თუ აღწერა არ შეიცავს სტრუქტურირებულ მონაცემებს */}
                {!product.description.includes("Monetization:") ? (
                  <p className="whitespace-pre-wrap">{product.description}</p>
                ) : (
                  <>
                    {/* პირველი ნაწილი description-დან */}
                    {product.description.split("Monetization:")[0]?.trim() && (
                      <p className="mb-3 whitespace-pre-wrap">{product.description.split("Monetization:")[0]?.trim()}</p>
                    )}
                    
                    {/* Monetization */}
                    <p className="mb-1.5"><strong>Monetization:</strong> <span className="whitespace-pre-wrap">{product.description.split("Monetization:")[1]?.split("Ways of promotion:")[0]?.trim() || "N/A"}</span></p>
                    
                    {/* Ways of promotion */}
                    {product.description.includes("Ways of promotion:") && (
                      <p className="mb-1.5"><strong>Ways of promotion:</strong> <span className="whitespace-pre-wrap">{product.description.split("Ways of promotion:")[1]?.split("Sources of expense:")[0]?.trim() || "N/A"}</span></p>
                    )}
                    
                    {/* Sources of expense */}
                    {product.description.includes("Sources of expense:") && (
                      <p className="mb-1.5"><strong>Sources of expense:</strong> <span className="whitespace-pre-wrap">{product.description.split("Sources of expense:")[1]?.split("Sources of income:")[0]?.trim() || "N/A"}</span></p>
                    )}
                    
                    {/* Sources of income */}
                    {product.description.includes("Sources of income:") && (
                      <p className="mb-1.5"><strong>Sources of income:</strong> <span className="whitespace-pre-wrap">{product.description.split("Sources of income:")[1]?.split("To support the channel, you need:")[0]?.trim() || "N/A"}</span></p>
                    )}
                    
                    {/* Support requirements */}
                    {product.description.includes("To support the channel, you need:") && (
                      <p className="mb-1.5"><strong>To support the channel, you need:</strong> <span className="whitespace-pre-wrap">{product.description.split("To support the channel, you need:")[1]?.split("Content:")[0]?.trim() || "N/A"}</span></p>
                    )}
                    
                    {/* Content */}
                    {product.description.includes("Content:") && (
                      <p className="mb-1.5"><strong>Content:</strong> <span className="whitespace-pre-wrap">{product.description.split("Content:")[1]?.split("$")[0]?.trim() || "N/A"}</span></p>
                    )}
                    
                    {/* Income */}
                    {product.description.includes("income (month)") && !product.monthlyIncome && (
                      <p><strong>Income (month):</strong> ${product.description.split("income (month)")[0]?.split("$").pop()?.trim() || "N/A"}</p>
                    )}
                    
                    {/* Expense */}
                    {product.description.includes("expense (month)") && !product.monthlyExpenses && (
                      <p><strong>Expense (month):</strong> ${product.description.split("expense (month)")[0]?.split("$").pop()?.trim() || "N/A"}</p>
                    )}
                  </>
                )}
              </>
            )}
            
            {/* additionalDetails ნაწილი - ვინაიდან შეიძლება დამატებით გვქონდეს */}
            {(product as any).additionalDetails && (
              <div className="mt-3">
                {Object.entries((product as any).additionalDetails).map(([key, value]) => (
                  <p key={key}><strong>{key}:</strong> {String(value)}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* გადიდებული ფოტოს მოდალი */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden">
            <button 
              className="absolute top-4 right-4 w-8 h-8 bg-white rounded-full flex items-center justify-center text-gray-800 z-10 shadow-md"
              onClick={() => setSelectedImage(null)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <Image
              src={selectedImage}
              alt="Enlarged product image"
              width={1200}
              height={900}
              className="max-h-[90vh] w-auto h-auto object-contain"
            />
          </div>
        </div>
      )}
      
      {/* Footer */}
      <footer className="bg-gray-900 text-white py-3 px-4 mt-auto text-sm">
        <div className="container mx-auto flex flex-col md:flex-row justify-between items-center">
          <div className="mb-2 md:mb-0">
            <div className="text-xs">MateSwap LP</div>
            <div className="text-xs text-gray-400">Address: 85 First Floor Great Portland Street, London, England, W1W 7LT</div>
          </div>
          <div className="flex space-x-4">
            <Link href="/terms" className="text-xs hover:text-gray-300 transition-colors">
              Terms and Conditions
            </Link>
            <Link href="/privacy" className="text-xs hover:text-gray-300 transition-colors">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}