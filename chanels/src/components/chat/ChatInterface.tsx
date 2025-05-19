"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useAuth } from "@/components/auth/AuthProvider";
import { Chat, Message } from "@/types/chat";
import { db, rtdb, functions, auth } from "@/firebase/config";
import { ref, push, onValue, off } from "firebase/database";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { addDoc, collection } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

interface ChatInterfaceProps {
  chatId: string;
  productId: string;
}

export default function ChatInterface({ chatId, productId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatData, setChatData] = useState<Chat | null>(null);
  const { user } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [isSubmittingWallet, setIsSubmittingWallet] = useState<boolean>(false);
  const [isWalletSubmitted, setIsWalletSubmitted] = useState<boolean>(false);
  const [paymentCompleted, setPaymentCompleted] = useState<boolean>(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);

  // Fetch chat data and messages
  useEffect(() => {
    if (!chatId || !user) return;

    setLoading(true);
    setError(null);

    if (typeof window !== 'undefined') {
      localStorage.setItem('lastChatId', chatId);
    }

    // Get chat data from Firestore
    const fetchChatData = async () => {
      try {
        const chatDocRef = doc(db, "chats", chatId);
        const chatDoc = await getDoc(chatDocRef);
        
        if (chatDoc.exists()) {
          const data = chatDoc.data() as Chat;
          setChatData(data);
          
          // დავამატოთ ბაზიდან მიღებული ჩატის მონაცემები კონსოლში
          console.log("Chat data from Firestore:", data);
          
          // შევამოწმოთ გადახდის სტატუსი
          setPaymentCompleted(!!data.paymentCompleted);
          console.log("Payment status:", data.paymentCompleted ? "Completed" : "Not completed");
          
          // შევამოწმოთ ჩატში არის თუ არა მონაცემი lastMessage
          if (data.lastMessage) {
            console.log("Last message found in Firestore:", data.lastMessage);
          } else {
            console.log("No last message found in Firestore");
          }
          
        } else {
          setError("Chat not found");
        }
      } catch (err) {
        console.error("Error fetching chat data:", err);
        setError("Failed to load chat data");
      }
    };

    fetchChatData();

    // Listen for messages from Realtime Database
    const messagesRef = ref(rtdb, `messages/${chatId}`);
    
    onValue(messagesRef, (snapshot) => {
      const data = snapshot.val();
      console.log("Firebase RTD Data:", data);
      if (data) {
        const messageList = Object.entries(data).map(([key, value]) => ({
          id: key,
          ...value as Omit<Message, 'id'>
        }));
        
        // Sort messages by timestamp
        messageList.sort((a, b) => a.timestamp - b.timestamp);
        
        console.log("Parsed messages:", messageList);
        setMessages(messageList);
        
        // შევამოწმოთ გადახდის დადასტურების შეტყობინება
        const paymentConfirmationMessage = messageList.find(msg => msg.isPaymentConfirmation);
        if (paymentConfirmationMessage) {
          setPaymentCompleted(true);
          console.log("Payment confirmation message found:", paymentConfirmationMessage);
        }
      } else {
        // თუ მონაცემები არ არის, ცარიელი მასივი დავაყენოთ
        setMessages([]);
      }
      setLoading(false);
    }, (err) => {
      console.error("Error fetching messages:", err);
      setError("Failed to load messages");
      setLoading(false);
    });

    return () => {
      // Clean up listener
      off(messagesRef);
    };
  }, [chatId, user]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newMessage.trim() || !user || !chatId) return;

    try {
      const messagesRef = ref(rtdb, `messages/${chatId}`);
      
      const timestamp = Date.now();
      
      // Check if this is an escrow request message
      const isEscrowRequest = newMessage.trim().includes("🔒 Request to Purchase");
      
      await push(messagesRef, {
        text: newMessage.trim(),
        senderId: user.id,
        senderName: user.name,
        senderPhotoURL: user.photoURL || null,
        timestamp: timestamp,
        isAdmin: user.isAdmin,
        // If this is an escrow message, we'll use the special formatting
        isEscrowRequest: isEscrowRequest
      });
      
      // განვაახლოთ ჩატში lastMessage ველი, რომ ჩატების სიაში სწორად გამოჩნდეს მესიჯი
      try {
        // ჩატის დოკუმენტის განახლება Firestore-ში
        const chatDocRef = doc(db, "chats", chatId);
        await updateDoc(chatDocRef, {
          lastMessage: {
            text: newMessage.trim(),
            timestamp: timestamp,
            senderId: user.id
          }
        });
        console.log("Chat lastMessage updated");
      } catch (err) {
        console.error("Error updating chat lastMessage:", err);
      }
      
      setNewMessage("");
    } catch (err) {
      console.error("Error sending message:", err);
      setError("Failed to send message");
    }
  };

  const handleRequestAdmin = async () => {
    if (!user || !chatId) return;

    try {
      // ლოგი
      console.log("Sending admin request for chat:", chatId);
      
      const adminRequestsRef = ref(rtdb, `adminRequests`);
      
      // Generate a unique ID for this request
      const requestTimestamp = Date.now();
      const requestData = {
        chatId,
        productId,
        productName: chatData?.productName || 'Unknown Product',
        requestedBy: user.id,
        requestedByName: user.name,
        timestamp: requestTimestamp
      };
      
      console.log("Request data:", requestData);
      
      // გაგზავნა
      await push(adminRequestsRef, requestData);
      
      // Send a system message to the chat
      const messagesRef = ref(rtdb, `messages/${chatId}`);
      
      await push(messagesRef, {
        text: "An admin (escrow agent) has been requested for this chat. They will join shortly.",
        senderId: "system",
        senderName: "System",
        timestamp: requestTimestamp,
        isSystem: true
      });
      
      // დადასტურება
      alert("Escrow agent request sent successfully!");
      
    } catch (err) {
      console.error("Error requesting admin:", err);
      setError("Failed to request admin");
      alert("Failed to request escrow agent. Please try again.");
    }
  };

  // Save seller's wallet address
  const handleSubmitWalletAddress = async () => {
    if (!walletAddress) return;

    setIsSubmittingWallet(true);
    try {
      console.log("Processing payment with method:", walletAddress);
      
      if (walletAddress === 'bitcoin') {
        // Bitcoin გადახდის ლოგიკა
        // Create a notification for the admin
        await addDoc(collection(db, "admin_notifications"), {
          type: "payment_intent",
          chatId,
          productId: chatData?.productId || '',
          productName: chatData?.productName || 'Unknown Product',
          buyerName: user?.name || "Unknown Buyer",
          buyerId: user?.id,
          paymentMethod: walletAddress,
          createdAt: Date.now(),
          read: false
        });

        // Show success message
        setIsWalletSubmitted(true);
      } else if (walletAddress === 'card') {
        try {
          // მივიღოთ მომხმარებლის ტოკენი
          const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : '';
          
          // თუ ტოკენი არ გვაქვს, შეცდომა გამოვაქვეყნოთ
          if (!token) {
            throw new Error('Authentication required. Please log in again.');
          }

          // მივიღოთ current window საიტის origin-ი
          const origin = window.location.origin;
          console.log("Current origin:", origin);

          // fetch-ის გამოყენებით გამოვიძახოთ HTTP ფუნქცია
          const response = await fetch('https://us-central1-projec-cca43.cloudfunctions.net/createPaymentSessionHttp', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
              'Origin': origin
            },
            body: JSON.stringify({
              chatId,
              userId: user?.id,
              origin  // დავამატოთ origin პარამეტრიც
            }),
            credentials: 'include'
          });
          
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            console.error('Payment API error:', errorData);
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.error || 'Unknown error'}`);
          }
          
          const data = await response.json();
          console.log("Payment session created successfully:", data);
          
          if (!data.url) {
            throw new Error('No checkout URL returned from server');
          }
          
          // გადავამისამართოთ Stripe Checkout გვერდზე
          window.location.href = data.url;
          return; // ვწყვეტთ ფუნქციას, რადგან Stripe checkout გვერდზე გადადის
        } catch (fetchError) {
          console.error("Fetch error:", fetchError);
          // ჩავარდნის შემთხვევაში ვცადოთ ძველი მეთოდით
          console.log("Falling back to httpsCallable method");
          
          try {
            // მივიღოთ მომხმარებლის ტოკენი თავიდან, ჩავარდნის შემთხვევისთვის
            if (auth.currentUser) {
              await auth.currentUser.getIdToken(true);
            }
            
            const createSession = httpsCallable(functions, "createPaymentSession");
            const result = await createSession({ 
              chatId,
              origin: window.location.origin
            });
            
            // შედეგის ტიპიზაცია და შემოწმება
            const data = result.data as { url?: string };
            
            if (!data || !data.url) {
              throw new Error('Invalid response from server');
            }
            
            console.log("Payment session created successfully with fallback:", data);
            
            // გადავამისამართოთ Stripe Checkout გვერდზე
            window.location.href = data.url;
            return; // ვწყვეტთ ფუნქციას, რადგან Stripe checkout გვერდზე გადადის
          } catch (error) {
            console.error("Error initiating Stripe payment:", error);
            
            // დავამატოთ შეტყობინების ჩვენება
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            alert(`Failed to initiate credit card payment: ${errorMessage}. Please try again.`);
            
            setIsSubmittingWallet(false);
            return;
          }
        }
      }
    } catch (error) {
      console.error("Error processing payment:", error);
      
      // დავამატოთ შეტყობინების ჩვენება
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to process payment: ${errorMessage}. Please try again later.`);
      
      setIsSubmittingWallet(false);
    } finally {
      setIsSubmittingWallet(false);
    }
  };

  // Message item component displayed in the chat
  const MessageItem = ({ message }: { message: Message }) => {
    const { user } = useAuth();
    const isOwn = message.senderId === user?.id;

    // Check if this is an escrow request message
    const isEscrowRequest = (message.isEscrowRequest || (message.text && message.text.includes("🔒 Request to Purchase")));

    // Special transaction request message
    if (message.isRequest && message.transactionData) {
      const { productName, price, paymentMethod, transactionId, useEscrow } = message.transactionData;
      const isSeller = user?.id !== message.senderId; // If the user is not the sender of the message, they are the seller
      
      return (
        <div className="p-6 mb-4 rounded-xl border-2 border-indigo-200 bg-white shadow-md">
          <div className="flex items-start mb-4">
            <h3 className="text-xl font-bold text-gray-800">Request to purchase <span className="text-blue-600">"{productName}"</span></h3>
          </div>
          
          <div className="mb-4">
            <div className="grid grid-cols-1 gap-2 text-gray-800">
              <div className="flex flex-col">
                <span className="font-medium">Transaction ID: <span className="font-normal">{transactionId}</span></span>
              </div>
              <div className="flex flex-col">
                <span className="font-medium">Transaction amount: <span className="font-normal">${price}</span></span>
              </div>
              <div className="flex flex-col">
                <span className="font-medium">Transfer to: <span className="font-normal">{
                  message.text && message.text.includes("Transfer to:") 
                    ? message.text.split("Transfer to:")[1].split("\n")[0].trim()
                    : "seller@example.com"
                }</span></span>
              </div>
            </div>
          </div>
          
          {useEscrow && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-gray-800">Transaction steps when using the escrow service:</h4>
              </div>
              
              <div className="flex space-x-4 mb-2">
                <div className="w-1/2 h-1 bg-blue-500 rounded-full"></div>
                <div className="w-1/2 h-1 bg-gray-200 rounded-full"></div>
              </div>
              
              <div className="text-sm text-gray-700 space-y-2 mt-4">
                <p><span className="font-medium">1.</span> The buyer pays a 4-8% ($3 minimum) service fee.</p>
                <p><span className="font-medium">2.</span> The seller designates the escrow agent as manager.</p>
                <p><span className="font-medium">3.</span> After 7 days the seller assigns primary ownership rights to the escrow agent (7 days is the minimum amount of time required in order to assign a new primary owner in the control panel).</p>
                <p><span className="font-medium">4.</span> The escrow agent verifies everything, removes the other managers, and notifies the buyer to pay the seller.</p>
                <p><span className="font-medium">5.</span> The buyer pays the seller.</p>
                <p><span className="font-medium">6.</span> After the seller's confirmation, the escrow agent assigns ownership rights to the buyer.</p>
              </div>
            </div>
          )}
          
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 mt-4">
            <div className="font-medium text-blue-800 mb-1">Transaction status:</div>
            <p className="text-blue-700">The terms of the transaction were confirmed. When you send your payment, the seller will be notified, and will need to transfer the account login details based on the agreed upon terms. If the seller does not respond, of breaks the rules, you can call upon the escrow agent (button below).</p>
          </div>
          
          {/* Input form for payment method selection - visible to both buyer and seller */}
          {!isWalletSubmitted && (
            <div className="mt-4 border-t border-gray-200 pt-4">
              <div className="mb-2 text-sm font-semibold text-gray-700">
                Please select payment method:
              </div>
              <div className="flex gap-2 items-center">
                <div className="relative min-w-[180px] w-auto">
                  <button
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="flex justify-between items-center px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all w-full min-w-[180px]"
                  >
                    <span>{walletAddress ? (walletAddress === 'card' ? 'Visa/Mastercard' : 'Bitcoin') : 'Select payment method'}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 ml-2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  {isDropdownOpen && (
                    <div className="absolute left-0 w-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 z-10 min-w-[180px]">
                      <button
                        onClick={() => {
                          setWalletAddress('card');
                          setIsDropdownOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 first:rounded-t-lg"
                      >
                        Visa/Mastercard
                      </button>
                      <button
                        onClick={() => {
                          setWalletAddress('bitcoin');
                          setIsDropdownOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 last:rounded-b-lg"
                      >
                        Bitcoin
                      </button>
                    </div>
                  )}
                </div>
                <button
                  onClick={handleSubmitWalletAddress}
                  disabled={!walletAddress || isSubmittingWallet}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-700 transition-all"
                >
                  {isSubmittingWallet ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full"></div>
                      <span>Processing...</span>
                    </div>
                  ) : (
                    'Pay the fee'
                  )}
                </button>
              </div>
              <div className="mt-2 text-xs text-gray-500">
                Note: Paying with card will redirect you to Stripe's secure payment page for a fee of 8% of the product price.
              </div>
            </div>
          )}
          
          {/* If payment method is selected */}
          {isWalletSubmitted && (
            <div className="mt-4 border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center bg-green-50 text-green-700 p-3 rounded-lg border border-green-200">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2 text-green-500">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium">Payment processing! The seller will be notified soon.</span>
                </div>
                <div className="pulse-animation">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                </div>
              </div>
              <style jsx>{`
                .pulse-animation {
                  display: flex;
                  align-items: center;
                  justify-content: center;
                }
                .pulse-animation div {
                  animation: pulse 1.5s infinite;
                }
                @keyframes pulse {
                  0% {
                    transform: scale(0.95);
                    box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.7);
                  }
                  70% {
                    transform: scale(1);
                    box-shadow: 0 0 0 10px rgba(74, 222, 128, 0);
                  }
                  100% {
                    transform: scale(0.95);
                    box-shadow: 0 0 0 0 rgba(74, 222, 128, 0);
                  }
                }
              `}</style>
            </div>
          )}
        </div>
      );
    }
    
    // For escrow request (new format)
    if (isEscrowRequest) {
      // Extract details from message
      const messageLines = message.text.split('\n');
      let transactionId = '';
      let amount = '';
      let paymentMethod = '';
      let productName = '';
      
      // Parse message to extract info
      messageLines.forEach(line => {
        if (line.includes('Transaction ID:')) {
          transactionId = line.split('Transaction ID:')[1].trim();
        } else if (line.includes('Transaction Amount:')) {
          amount = line.split('Transaction Amount:')[1].trim();
        } else if (line.includes('Payment Method:')) {
          paymentMethod = line.split('Payment Method:')[1].trim();
        } else if (line.includes('🔒 Request to Purchase')) {
          // Create the productName from the part after "Request to Purchase"
          productName = line.split('🔒 Request to Purchase')[1].trim();
        }
      });
      
      // Determine if the current user is the seller (not the sender of the escrow request)
      const isSeller = user?.id !== message.senderId;
      
      return (
        <div className="p-6 mb-4 rounded-xl border-2 border-indigo-200 bg-white shadow-md">
          <div className="flex items-start mb-4">
            <div className="mr-2 text-blue-600">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-800">Request to purchase <span className="text-blue-600">{productName}</span></h3>
          </div>
          
          <div className="mb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-gray-800">
              <div className="flex flex-col p-3 bg-gray-50 rounded-lg border border-gray-100">
                <span className="text-xs text-gray-500 mb-1">Transaction ID</span>
                <span className="font-medium">{transactionId}</span>
              </div>
              <div className="flex flex-col p-3 bg-gray-50 rounded-lg border border-gray-100">
                <span className="text-xs text-gray-500 mb-1">Amount</span>
                <span className="font-medium">{amount}</span>
              </div>
              <div className="flex flex-col p-3 bg-gray-50 rounded-lg border border-gray-100">
                <span className="text-xs text-gray-500 mb-1">Payment Method</span>
                <span className="font-medium">{paymentMethod}</span>
              </div>
            </div>
          </div>
          
          <div className="mb-4 bg-blue-50 p-4 rounded-lg border border-blue-100">
            <h4 className="font-medium text-blue-800 mb-3">Escrow Service Process:</h4>
            <ol className="space-y-2 text-sm text-blue-700">
              <li className="flex items-start">
                <span className="bg-blue-200 text-blue-800 w-5 h-5 rounded-full flex items-center justify-center mr-2 flex-shrink-0 font-medium">1</span>
                <span>The buyer pays the cost of the channel + 8% ($3 minimum) service fee.</span>
              </li>
              <li className="flex items-start">
                <span className="bg-blue-200 text-blue-800 w-5 h-5 rounded-full flex items-center justify-center mr-2 flex-shrink-0 font-medium">2</span>
                <span>The seller confirms and agrees to use the escrow service.</span>
              </li>
              <li className="flex items-start">
                <span className="bg-blue-200 text-blue-800 w-5 h-5 rounded-full flex items-center justify-center mr-2 flex-shrink-0 font-medium">3</span>
                <span>The escrow agent verifies everything and assigns manager rights to the buyer.</span>
              </li>
              <li className="flex items-start">
                <span className="bg-blue-200 text-blue-800 w-5 h-5 rounded-full flex items-center justify-center mr-2 flex-shrink-0 font-medium">4</span>
                <span>After 7 days (or sooner if agreed), the escrow agent removes other managers and transfers full ownership to the buyer.</span>
              </li>
              <li className="flex items-start">
                <span className="bg-blue-200 text-blue-800 w-5 h-5 rounded-full flex items-center justify-center mr-2 flex-shrink-0 font-medium">5</span>
                <span>The funds are then released to the seller. Payments are sent instantly via all major payment methods.</span>
              </li>
            </ol>
          </div>
          
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 mt-4">
            <div className="font-medium text-blue-800 mb-1">Transaction status:</div>
            <p className="text-blue-700">The terms of the transaction were confirmed. When you send your payment, the seller will be notified, and will need to transfer the account login details based on the agreed upon terms. If the seller does not respond, of breaks the rules, you can call upon the escrow agent (button below).</p>
          </div>

          {/* Input form for the buyer's payment method selection */}
          {!isSeller && !isWalletSubmitted && (
            <div className="mt-4 border-t border-gray-200 pt-4">
              <div className="mb-2 text-sm font-semibold text-gray-700">
                Please select payment method:
              </div>
              <div className="flex gap-2 items-center">
                <div className="relative min-w-[180px] w-auto">
                  <button
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="flex justify-between items-center px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all w-full min-w-[180px]"
                  >
                    <span>{walletAddress ? (walletAddress === 'card' ? 'Visa/Mastercard' : 'Bitcoin') : 'Select payment method'}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 ml-2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  {isDropdownOpen && (
                    <div className="absolute left-0 w-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 z-10 min-w-[180px]">
                      <button
                        onClick={() => {
                          setWalletAddress('card');
                          setIsDropdownOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 first:rounded-t-lg"
                      >
                        Visa/Mastercard
                      </button>
                      <button
                        onClick={() => {
                          setWalletAddress('bitcoin');
                          setIsDropdownOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 last:rounded-b-lg"
                      >
                        Bitcoin
                      </button>
                    </div>
                  )}
                </div>
                <button
                  onClick={handleSubmitWalletAddress}
                  disabled={!walletAddress || isSubmittingWallet}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-700 transition-all"
                >
                  {isSubmittingWallet ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full"></div>
                      <span>Processing...</span>
                    </div>
                  ) : (
                    'Pay the fee'
                  )}
                </button>
              </div>
              <div className="mt-2 text-xs text-gray-500">
                Note: Paying with card will redirect you to Stripe's secure payment page for a fee of 8% of the product price.
              </div>
            </div>
          )}
          
          {/* If payment method is selected */}
          {isWalletSubmitted && (
            <div className="mt-4 border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center bg-green-50 text-green-700 p-3 rounded-lg border border-green-200">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2 text-green-500">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium">Payment processing! The seller will be notified soon.</span>
                </div>
                <div className="pulse-animation">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                </div>
              </div>
              <style jsx>{`
                .pulse-animation {
                  display: flex;
                  align-items: center;
                  justify-content: center;
                }
                .pulse-animation div {
                  animation: pulse 1.5s infinite;
                }
                @keyframes pulse {
                  0% {
                    transform: scale(0.95);
                    box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.7);
                  }
                  70% {
                    transform: scale(1);
                    box-shadow: 0 0 0 10px rgba(74, 222, 128, 0);
                  }
                  100% {
                    transform: scale(0.95);
                    box-shadow: 0 0 0 0 rgba(74, 222, 128, 0);
                  }
                }
              `}</style>
            </div>
          )}
        </div>
      );
    }
    
    // Regular message
    return (
      <div className={`flex mb-4 ${isOwn ? 'justify-end' : 'justify-start'}`}>
        {!isOwn && (
          <div className="h-12 w-12 rounded-full overflow-hidden mr-2 flex-shrink-0 border border-gray-200 shadow-sm">
            {message.isAdmin ? (
              <Image 
                src="/agent.png" 
                alt="Escrow Agent"
                width={48}
                height={48}
                className="h-full w-full object-contain p-0"
              />
            ) : message.senderPhotoURL ? (
              <Image 
                src={message.senderPhotoURL} 
                alt={message.senderName}
                width={48}
                height={48}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center text-white font-medium">
                {message.senderName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        )}
        
        <div 
          className={`max-w-[80%] p-3 rounded-lg shadow-sm ${
            isOwn 
              ? 'bg-gradient-to-r from-indigo-600 to-blue-500 text-white rounded-tr-none' 
              : message.isAdmin 
                ? 'bg-green-100 text-green-800 rounded-tl-none border border-green-200' 
                : message.isSystem
                  ? 'bg-yellow-50 text-yellow-800 border border-yellow-200'
                  : 'bg-white text-gray-800 rounded-tl-none border border-gray-100'
          }`}
        >
          {!isOwn && !message.isAdmin && !message.isSystem && (
            <div className="text-sm font-medium mb-1 text-indigo-800">{message.senderName}</div>
          )}
          {message.isAdmin && (
            <div className="text-xs font-medium mb-1 text-green-600 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 mr-1">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
              </svg>
              Escrow Agent
            </div>
          )}
          {message.isSystem && (
            <div className="text-xs font-medium mb-1 text-yellow-600 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 mr-1">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
              System
            </div>
          )}
          
          <div className="whitespace-pre-wrap break-words">{message.text}</div>
          
          <div className={`text-xs mt-1 text-right ${isOwn ? 'text-indigo-100' : message.isAdmin ? 'text-green-500' : message.isSystem ? 'text-yellow-500' : 'text-gray-400'}`}>
            {new Date(message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
          </div>
        </div>
        
        {isOwn && (
          <div className="h-12 w-12 rounded-full overflow-hidden ml-2 flex-shrink-0 border border-gray-200 shadow-sm">
            {message.isAdmin ? (
              <Image 
                src="/agent.png" 
                alt="Escrow Agent"
                width={48}
                height={48}
                className="h-full w-full object-contain p-0"
              />
            ) : message.senderPhotoURL ? (
              <Image 
                src={message.senderPhotoURL} 
                alt={message.senderName}
                width={48}
                height={48}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center text-white font-medium">
                {message.senderName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ჩატის ინტერფეისში დავამატოთ სისტემური შეტყობინების კომპონენტი
  const PaymentStatusMessage = () => {
    // თუ საუბარში უკვე არის გადახდის დადასტურების შეტყობინება, აღარ ვაჩენებთ დამატებით შეტყობინებას
    const paymentConfirmationExists = messages.some(msg => msg.isPaymentConfirmation);
    
    if (paymentConfirmationExists || !chatData?.productId) {
      return null; // არ ვაჩვენოთ თუ ეს არ არის პროდუქტის ჩატი ან უკვე არის გადახდის შეტყობინება
    }

    const messageText = "";
    
    const afterPaymentMessage = "✅ Payment confirmed.\nThe seller has been notified and is now required to provide the agreed login details.\nIf the seller fails to deliver or violates the terms, you can request assistance from the escrow agent using the button below.";
    
        return null;
  };

  if (!user) {
    return (
      <div className="h-full flex items-center justify-center">
        <p>Authorization is required to view this chat</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 rounded-lg overflow-hidden">
      {/* Chat Header */}
      <div className="bg-white p-4 border-b flex items-center justify-between shadow-sm">
        <div className="flex items-center">
          <h2 className="font-bold text-lg text-gray-800 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2 text-indigo-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
            </svg>
            <span>{chatData?.productName || 'Chat'}</span>
          </h2>
          {chatData?.adminJoined && (
            <span className="ml-2 px-3 py-1 bg-green-100 text-green-800 text-xs rounded-full flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 mr-1">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
              </svg>
              Escrow Active
            </span>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500">
            <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 text-indigo-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6.8 3.11 2.19 4.024C6.07 18.332 7.5 19.5 9 19.5h6c1.5 0 2.93-1.168 3.99-2.715.32-.297.71-.53 1.13-.69M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">მესიჯები არ არის</h3>
            <p className="text-gray-500">დაიწყეთ საუბარი მესიჯის გაგზავნით</p>
          </div>
        ) : (
          <>
            {/* დავამატოთ გადახდის სტატუსის შეტყობინება ჩატის დასაწყისში */}
            <PaymentStatusMessage />
            
            {messages.map((message) => (
              <MessageItem key={message.id} message={message} />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Message Input */}
      <form onSubmit={handleSendMessage} className="bg-white p-4 border-t">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-full bg-gray-50 hover:bg-white focus-within:bg-white focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100 transition-all duration-200 shadow-sm">
            <button
              type="button"
              className="text-gray-400 hover:text-indigo-500 transition-colors"
              title="Add emoji"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
              </svg>
            </button>
            
            <button
              type="button"
              className="text-gray-400 hover:text-indigo-500 transition-colors"
              title="Insert escrow request template"
              onClick={() => {
                setNewMessage(`🔒 Request to Purchase ოქტოპუსი / Octopus
Transaction ID: 1736366
Transaction Amount: $12
Payment Method: Stripe
The buyer pays the cost of the channel + 8% ($3 minimum) service fee.

The seller confirms and agrees to use the escrow service.

The escrow agent verifies everything and assigns manager rights to the buyer.

After 7 days (or sooner if agreed), the escrow agent removes other managers and transfers full ownership to the buyer.

The funds are then released to the seller. Payments are sent instantly via all major payment methods.`);
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </button>
            
            <button
              type="button"
              className="text-gray-400 hover:text-indigo-500 transition-colors"
              title="Attach file"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
              </svg>
            </button>
            
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="დაწერეთ მესიჯი..."
              className="flex-1 bg-transparent border-none outline-none placeholder-gray-400 text-gray-800"
            />
          </div>
          
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="p-3 bg-gradient-to-r from-indigo-600 to-blue-500 hover:from-indigo-700 hover:to-blue-600 text-white rounded-full hover:shadow-md disabled:opacity-50 transition-all duration-200 flex items-center justify-center"
            title="Send message"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
} 