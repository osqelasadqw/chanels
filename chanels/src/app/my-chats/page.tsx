"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import ChatInterface from "@/components/chat/ChatInterface";
import Image from "next/image";
import { collection, query, where, onSnapshot, doc, updateDoc, arrayUnion, getDoc, addDoc, serverTimestamp, deleteDoc } from "firebase/firestore";
import { db } from "@/firebase/config";
import { Chat } from "@/types/chat";
import { ref, push } from "firebase/database";
import { rtdb } from "@/firebase/config";

// ჩატების გვერდის შიგთავსის კომპონენტი
function MyChatsContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const chatIdFromUrl = searchParams.get('chatId');
  const paymentStatus = searchParams.get('payment');
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string>("");

  // დავამატოთ კოდი, რომელიც ამუშავებს Stripe-დან დაბრუნების შემთხვევას
  useEffect(() => {
    if (paymentStatus && chatIdFromUrl) {
      // ვმუშაობთ გადახდის შედეგების დამუშავებაზე
      console.log(`Payment status detected: ${paymentStatus} for chat: ${chatIdFromUrl}`);
      
      let toastElement: HTMLDivElement | null = null;
      
      if (paymentStatus === 'success') {
        // წარმატებული გადახდის შეტყობინება
        toastElement = document.createElement('div');
        toastElement.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-md shadow-lg z-50 flex items-center';
        toastElement.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 mr-2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Payment successful! The escrow service has been notified.
        `;
      } else if (paymentStatus === 'cancelled') {
        // გაუქმებული გადახდის შეტყობინება
        toastElement = document.createElement('div');
        toastElement.className = 'fixed top-4 right-4 bg-yellow-500 text-white px-4 py-2 rounded-md shadow-lg z-50 flex items-center';
        toastElement.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 mr-2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          </svg>
          Payment cancelled. You can try again later.
        `;
      }
      
      if (toastElement) {
        document.body.appendChild(toastElement);
        
        // 5 წამში გავაქროთ შეტყობინება
        setTimeout(() => {
          if (toastElement && document.body.contains(toastElement)) {
            document.body.removeChild(toastElement);
          }
        }, 5000);
        
        // გადავამისამართოთ მომხმარებელი გვერდზე პარამეტრის გარეშე ან მხოლოდ chatId-ით
        // რადგან არ გვჭირდება payment პარამეტრი URL-ში
        router.replace(`/my-chats?chatId=${chatIdFromUrl}`);
      }
    }
  }, [paymentStatus, chatIdFromUrl, router]);
  
  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push("/");
    }
  }, [user, loading, router]);
  
  // Select chat from URL parameters if available
  useEffect(() => {
    const selectChatFromUrl = async () => {
      if (chatIdFromUrl && user) {
        console.log('Found chatId in URL:', chatIdFromUrl);
        
        try {
          // Get the chat document to verify it exists and user has access
          const chatDoc = await getDoc(doc(db, "chats", chatIdFromUrl));
          
          if (chatDoc.exists() && chatDoc.data().participants.includes(user.id)) {
            console.log('Chat exists and user has access, selecting chat:', chatIdFromUrl);
            // Set the selected chat
            setSelectedChatId(chatIdFromUrl);
            // Also set the product ID
            setProductId(chatDoc.data().productId || "");
          } else {
            console.log('Chat not found or user has no access');
          }
        } catch (error) {
          console.error('Error selecting chat from URL:', error);
        }
      }
    };
    
    if (chatIdFromUrl) {
      selectChatFromUrl();
    }
  }, [chatIdFromUrl, user]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gradient-to-r from-gray-50 to-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect due to the useEffect
  }

  const handleChatSelect = (chatId: string, productId: string) => {
    setSelectedChatId(chatId);
    setProductId(productId);
  };

  // TODO: Implement actual escrow agent call functionality
  const handleCallEscrowAgent = async () => {
    if (selectedChatId && productId && user) {
      try {
        // მივიღოთ ადმინის ID კონსტანტიდან ან კონფიგურაციიდან
        const ADMIN_ID = "admin_1"; // რეალურ გარემოში ეს უნდა იყოს კონფიგის ფაილში ან env ცვლადში
        const adminId = ADMIN_ID;

        // Create a new chat document for the escrow request
        const newChatRef = await addDoc(collection(db, "chats"), {
          participants: [user.id, adminId],
          participantNames: {
            [user.id]: user.name || user.email || "User",
            [adminId]: "Admin", // Or fetch admin's name
          },
          participantPhotos: {
            [user.id]: user.photoURL || "",
            [adminId]: "", // Admin photo URL if available
          },
          productId: productId,
          originalChatId: selectedChatId, // Store the original chat ID
          isEscrowChat: true, // Flag to identify this as an escrow chat
          createdAt: serverTimestamp(),
          lastMessage: {
            text: `Escrow service requested for product ID: ${productId} (from chat: ${selectedChatId})`,
            senderId: user.id,
            timestamp: serverTimestamp(),
          },
          adminJoined: true, // Or set to false and update when admin actually joins/views
          hiddenBy: [],
        });

        console.log(`New escrow chat created with ID: ${newChatRef.id}`);
        
        // გამონაკლისი: როდესაც მომხმარებელი ითხოვს Escrow Service-ს, 
        // არ გაიგზავნოს ავტომატური ტრანზაქციის მოთხოვნის შეტყობინება.
        // ადმინისტრატორი თვითონ გააგზავნის პირველ შეტყობინებას ჩატში.

        // მომხმარებელს ვაჩვენოთ ახალი ჩატის ID და შეტყობინება
        alert(`ესქროუ სერვისის მოთხოვნა გაიგზავნა. ახალი ჩატი შეიქმნა ID-ით: ${newChatRef.id}`);

        // ავტომატურად გადავიყვანოთ მომხმარებელი ახალ ჩატში
        router.push(`/my-chats?chatId=${newChatRef.id}`);
        // განვაახლოთ აქტიური ჩატის ID
        setSelectedChatId(newChatRef.id);

      } catch (error) {
        console.error("Error creating escrow chat:", error);
        alert("Failed to request escrow service. Please try again.");
      }
    } else {
      alert("Please select a chat and ensure product ID is available.");
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-50">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-600 to-blue-500 py-4 px-6 shadow-md">
        <div className="max-w-full w-full mx-auto">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6 mr-2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6.8 3.11 2.19 4.024C6.07 18.332 7.5 19.5 9 19.5h6c1.5 0 2.93-1.168 3.99-2.715.32-.297.71-.53 1.13-.69M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
              </svg>
              Messaging Center
            </h1>
            <Link 
              href="/"
              className="px-4 py-2 bg-white text-indigo-600 rounded-md hover:bg-indigo-50 transition-colors duration-150 flex items-center shadow-sm font-medium"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 mr-1">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
              </svg>
              Home
            </Link>
          </div>
        </div>
      </div>

      {/* Chat Interface */}
      <div className="flex flex-1 overflow-hidden w-full mx-0 rounded-none shadow-lg bg-white">
        {/* Chat List on the left */}
        <div className="w-full md:w-1/3 lg:w-1/4 xl:w-1/5 h-full flex flex-col border-r border-gray-200">
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-800">My Conversations</h2>
          </div>
          <div className="flex-grow overflow-y-auto bg-white">
            <EnhancedChatList onChatSelect={handleChatSelect} selectedChatId={selectedChatId} />
          </div>
          {selectedChatId && (
            <div className="p-4 bg-gray-50 border-t border-gray-200">
              <button 
                onClick={handleCallEscrowAgent}
                className="w-full bg-gradient-to-r from-indigo-600 to-blue-500 hover:from-indigo-700 hover:to-blue-600 text-white font-medium py-2.5 px-4 rounded-md shadow-sm hover:shadow transition-all duration-150 flex items-center justify-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 mr-1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                </svg>
                Request Escrow Service
              </button>
            </div>
          )}
        </div>
        
        {/* Chat Window on the right */}
        <div className="flex-1 h-full bg-gray-50">
          {selectedChatId ? (
            <ChatInterface chatId={selectedChatId} productId={productId} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-500">
              <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 text-indigo-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6.8 3.11 2.19 4.024C6.07 18.332 7.5 19.5 9 19.5h6c1.5 0 2.93-1.168 3.99-2.715.32-.297.71-.53 1.13-.69M7.5 11.25v-1.5c0-.8.4-1.6.8-2.4C8.4 6.56 9.5 5.25 11.1 5.25h1.8c1.6 0 2.7 1.31 2.9 2.4.2.8.2 1.6 0 2.4" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">No Conversations Yet</h3>
              <p className="text-gray-500 mb-6 text-center">Connect with sellers by browsing channels and starting a conversation</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// მთავარი ექსპორტირებული კომპონენტი Suspense-ით
export default function MyChatsPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center h-screen bg-gradient-to-r from-gray-50 to-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
      </div>
    }>
      <MyChatsContent />
    </Suspense>
  );
}

// Enhanced Chat List Component
function EnhancedChatList({ onChatSelect, selectedChatId }: { onChatSelect: (chatId: string, productId: string) => void, selectedChatId: string | null }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const { user } = useAuth();

  // Function to delete chat for the current user
  const deleteChatForUser = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Stop click propagation to parent elements
    
    if (!user) return;
    
    // Confirmation dialog for full deletion
    const confirmDelete = window.confirm("Are you sure you want to permanently delete this chat? This action will delete the chat for ALL participants and cannot be undone.");
    if (!confirmDelete) return;

    try {
      setDeletingChatId(chatId);
      
      // Reference to the chat document in the main "chats" collection
      const chatDocRef = doc(db, "chats", chatId);
      
      console.log(`Attempting to delete chat document: chats/${chatId}`);
      
      // Delete the chat document from the "chats" collection
      await deleteDoc(chatDocRef);
      
      // Locally remove the chat from the UI
      setChats(prevChats => prevChats.filter(chat => chat.id !== chatId));
      
      // Success message (toast)
      const toastElement = document.createElement('div');
      toastElement.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-md shadow-lg z-50 flex items-center';
      toastElement.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 mr-2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Chat permanently deleted for all participants.
      `;
      document.body.appendChild(toastElement);
      
      setTimeout(() => {
        toastElement.remove();
      }, 3000);

    } catch (err) {
      console.error("Error deleting chat document:", err);
      // Error message (toast)
      const errorToast = document.createElement('div');
      errorToast.className = 'fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-md shadow-lg z-50 flex items-center';
      errorToast.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 mr-2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        Failed to delete chat. Please try again.
      `;
      document.body.appendChild(errorToast);
      setTimeout(() => {
        errorToast.remove();
      }, 3000);
    } finally {
      setDeletingChatId(null);
    }
  };

  useEffect(() => {
    if (!user) return;

    setLoading(true);
    setError(null);

    // Get chats where the current user is a participant
    const chatsQuery = query(
      collection(db, "chats"),
      where("participants", "array-contains", user.id)
    );

    const unsubscribe = onSnapshot(
      chatsQuery,
      (snapshot) => {
        const chatList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data()
        } as Chat));
        
        // Filter hidden chats
        const filteredChats = chatList.filter(chat => {
          const hiddenArray = chat.hiddenBy || [];
          return !hiddenArray.includes(user.id);
        });
        
        // Sort by createdAt in descending order
        filteredChats.sort((a, b) => b.createdAt - a.createdAt);
        
        setChats(filteredChats);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching chats:", err);
        setError("Failed to load chats");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 bg-white">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-600 mb-3"></div>
        <p className="text-sm text-gray-500">Loading your conversations...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-700 p-5 m-4 rounded-lg border border-red-200 flex flex-col items-center">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-red-500 mb-2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        <p className="text-center font-medium">{error}</p>
        <button 
          onClick={() => window.location.reload()} 
          className="mt-3 text-sm bg-red-100 hover:bg-red-200 text-red-700 px-4 py-2 rounded-md transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 px-4 bg-white">
        <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 text-indigo-500">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6.8 3.11 2.19 4.024C6.07 18.332 7.5 19.5 9 19.5h6c1.5 0 2.93-1.168 3.99-2.715.32-.297.71-.53 1.13-.69M7.5 11.25v-1.5c0-.8.4-1.6.8-2.4C8.4 6.56 9.5 5.25 11.1 5.25h1.8c1.6 0 2.7 1.31 2.9 2.4.2.8.2 1.6 0 2.4" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-gray-800 mb-2">No Conversations Yet</h3>
        <p className="text-gray-500 mb-6 text-center">Connect with sellers by browsing channels and starting a conversation</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {chats.map((chat) => {
        // Find the other participant's info
        const participants = chat.participants || [];
        const otherParticipants = participants.filter(id => id !== user?.id);
        const otherParticipantId = otherParticipants.length > 0 ? otherParticipants[0] : "";
        
        // Safely access nested properties
        const participantNames = chat.participantNames || {};
        const participantPhotos = chat.participantPhotos || {};
        
        const otherParticipantName = otherParticipantId && participantNames[otherParticipantId] 
          ? participantNames[otherParticipantId] 
          : "Unknown User";
          
        const otherParticipantPhoto = otherParticipantId && participantPhotos[otherParticipantId]
          ? participantPhotos[otherParticipantId]
          : "";

        // Get message time in readable format
        const getMessageTime = () => {
          if (!chat.lastMessage?.timestamp && !chat.createdAt) return "Unknown";
          
          const timestamp = chat.lastMessage?.timestamp || chat.createdAt;
          const date = new Date(timestamp);
          const now = new Date();
          
          // If today, show only time
          if (date.toDateString() === now.toDateString()) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          }
          
          // If this year, show month and day
          if (date.getFullYear() === now.getFullYear()) {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
          }
          
          // Otherwise show date
          return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
        };

        // If this chat is being hidden, skip rendering it
        if (deletingChatId === chat.id) {
          return (
            <div key={chat.id} className="p-4 flex justify-center items-center">
              <div className="animate-pulse flex items-center">
                <div className="animate-spin mr-2 rounded-full h-5 w-5 border-t-2 border-b-2 border-indigo-600"></div>
                <span className="text-gray-500 text-sm">Deleting conversation...</span>
              </div>
            </div>
          );
        }

        const isSelected = selectedChatId === chat.id;

        return (
          <div key={chat.id} className={`relative group ${isSelected ? 'bg-indigo-50' : ''}`}>
            <button 
              className={`w-full flex items-center p-4 hover:bg-indigo-50 transition-colors text-left
                ${isSelected ? 'bg-indigo-50 border-l-4 border-indigo-600' : 'border-l-4 border-transparent'}`}
              onClick={() => onChatSelect(chat.id, chat.productId || '')}
            >
              <div className="relative h-12 w-12 rounded-full overflow-hidden mr-4 flex-shrink-0 shadow-sm border border-gray-200">
                {otherParticipantPhoto ? (
                  <Image
                    src={otherParticipantPhoto}
                    alt={otherParticipantName}
                    width={48}
                    height={48}
                    className={`h-11 w-11 rounded-full ${isSelected ? 'object-contain p-0.5 bg-white' : 'object-cover'}`}
                    onError={(e) => {
                      const parent = e.currentTarget.parentElement;
                      if (parent) {
                        const fallback = parent.querySelector('.fallback-initial-div');
                        if (fallback) (fallback as HTMLElement).style.display = 'flex';
                      }
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="fallback-initial-div h-11 w-11 rounded-full bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center text-white font-semibold text-lg">
                    {otherParticipantName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white
                  ${chat.lastMessage?.timestamp && (Date.now() - chat.lastMessage.timestamp < 86400000) ? 'bg-green-500' : 'bg-gray-400'}`}>
                </div>
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline">
                  <h3 className={`font-medium truncate ${isSelected ? 'text-indigo-700' : 'text-gray-800'}`}>
                    {otherParticipantName}
                  </h3>
                  <span className={`text-xs ${isSelected ? 'text-indigo-500' : 'text-gray-500'}`}>
                    {getMessageTime()}
                  </span>
                </div>
                
                <p className={`text-sm truncate mt-0.5 ${isSelected ? 'text-indigo-700' : 'text-gray-600'}`}>
                  {chat.lastMessage ? chat.lastMessage.text : "ჩატი დაწყებულია"}
                </p>
              </div>
              
              {chat.adminJoined && (
                <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full whitespace-nowrap flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 mr-1">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                  </svg>
                  Escrow
                </span>
              )}
            </button>
            
            {/* Delete chat button - improved styling */}
            <button 
              onClick={(e) => deleteChatForUser(chat.id, e)}
              disabled={deletingChatId === chat.id}
              className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-100 rounded-full transition-colors duration-150 z-10 opacity-0 group-hover:opacity-100 focus:opacity-100"
              aria-label="Delete chat"
            >
              {deletingChatId === chat.id ? (
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
} 