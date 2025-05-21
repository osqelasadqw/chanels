/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {onRequest} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import Stripe from "stripe";
import { onCall } from "firebase-functions/v2/https";
import { HttpsError } from "firebase-functions/v2/https";

// Initialize Firebase Admin SDK
admin.initializeApp();

// Initialize Stripe with your secret key
// Ensure you have set this in your Firebase environment configuration
// firebase functions:config:set stripe.secret_key="sk_test_YOUR_STRIPE_SECRET_KEY"
// TODO: Replace with your actual secret key or retrieve from config more securely
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_51RLBSSQ8LGr3xtvjOGGeTYOWzelch4vjogqlQzP0xprOfSMaWbC6SkmxqBCM6T4kcPRw8dblfICOSMdz2lHQSZiH00WhzDpB8I", {
  apiVersion: "2022-11-15" as Stripe.StripeConfig['apiVersion'],
});

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

export const createPaymentSessionHttp = onRequest(
  { cors: true }, // Enable CORS for all origins, or specify your frontend URL
  async (request, response) => {
    logger.info("createPaymentSessionHttp function triggered", { body: request.body });

    if (request.method !== "POST") {
      response.status(405).send("Method Not Allowed");
      return;
    }

    try {
      const { chatId, userId, origin } = request.body;

      if (!chatId || !userId || !origin) {
        logger.error("Missing required parameters: chatId, userId, or origin");
        response.status(400).json({ error: "Missing required parameters." });
        return;
      }

      // ფუნქციის გასასწორებელი ნაწილი - ვამოღებთ რეალურ პროდუქტის ფასს ბაზიდან
      logger.info("Fetching chat data for ID:", chatId);
      
      // მივიღოთ ჩატის მონაცემები
      const chatDoc = await admin.firestore().collection('chats').doc(chatId).get();
      
      if (!chatDoc.exists) {
        logger.error(`Chat with ID ${chatId} not found`);
        response.status(404).json({ error: "Chat not found" });
        return;
      }
      
      const chatData = chatDoc.data();
      const productId = chatData?.productId;
      
      if (!productId) {
        logger.error(`Product ID not found in chat ${chatId}`);
        response.status(404).json({ error: "Product ID not found in chat" });
        return;
      }
      
      logger.info(`Fetching product data for ID: ${productId}`);
      
      // მივიღოთ პროდუქტის მონაცემები
      const productDoc = await admin.firestore().collection('products').doc(productId).get();
      
      if (!productDoc.exists) {
        logger.error(`Product with ID ${productId} not found`);
        response.status(404).json({ error: "Product not found" });
        return;
      }
      
      const productData = productDoc.data();
      const productPrice = productData?.price || 0;
      const productName = productData?.displayName || "Unknown Product";
      
      logger.info(`Product price: $${productPrice}, name: ${productName}`);
      
      // გამოვთვალოთ 8% საკომისიო (მინიმუმ $3)
      const serviceFeePercent = 0.08; // 8%
      const minServiceFee = 3; // $3 მინიმუმი
      const serviceFee = Math.max(productPrice * serviceFeePercent, minServiceFee);
      const roundedServiceFee = Math.round(serviceFee * 100) / 100; // ორი ათწილადით დამრგვალება
      
      logger.info(`Calculated service fee: $${roundedServiceFee} (${serviceFeePercent * 100}% of $${productPrice}, min $${minServiceFee})`);
      
      // გამოვთვალოთ საერთო თანხა (პროდუქტის ფასი + საკომისიო)
      const totalAmount = productPrice + roundedServiceFee;
      const roundedTotalAmount = Math.round(totalAmount * 100) / 100; // ორი ათწილადით დამრგვალება
      
      logger.info(`Total amount: $${roundedTotalAmount} (Product $${productPrice} + Fee $${roundedServiceFee})`);
      
      // ფასის კონვერტაცია ცენტებში Stripe-სთვის
      const priceInCents = Math.round(roundedTotalAmount * 100);
      const currency = "usd";
      const productDescription = `${productName} + ${serviceFeePercent * 100}% escrow service fee`;
      
      // Validate origin to prevent CSRF attacks if needed
      // const allowedOrigins = ['https://your-app-domain.com', 'http://localhost:3000'];
      // if (!allowedOrigins.includes(origin)) {
      //   logger.error("Invalid origin:", origin);
      //   response.status(403).json({ error: "Forbidden: Invalid origin" });
      //   return;
      // }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: currency,
              product_data: {
                name: `${productName} + Escrow Service Fee`,
                description: productDescription,
                // images: ["https://example.com/t-shirt.png"], // Optional: Add product image
              },
              unit_amount: priceInCents, // Amount in cents
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${origin}/my-chats?chatId=${chatId}&payment=success`, // Redirect URL on successful payment
        cancel_url: `${origin}/my-chats?chatId=${chatId}&payment=cancelled`,   // Redirect URL on cancelled payment
        client_reference_id: chatId, // Optional: Helps reconcile payments with your internal data
        metadata: {
          chatId: chatId,
          userId: userId,
          productId: productId,
          productPrice: productPrice.toString(),
          serviceFee: roundedServiceFee.toString(),
          totalAmount: roundedTotalAmount.toString()
        },
      });

      if (session.url) {
        logger.info("Stripe Checkout session created successfully:", { sessionId: session.id, url: session.url });
        
        // განვაახლოთ ჩატის მონაცემები Firestore-ში, რომ ვიცოდეთ Stripe სესიის ID
        try {
          await admin.firestore().collection('chats').doc(chatId).update({
            paymentSessionId: session.id,
            paymentStatus: 'pending',
            feeAmount: roundedServiceFee,
            totalAmount: parseFloat(session.metadata?.totalAmount || '0'),
            productPrice: parseFloat(session.metadata?.productPrice || '0'),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          logger.info(`Updated chat ${chatId} with paymentSessionId ${session.id}`);
        } catch (updateError) {
          logger.error(`Failed to update chat with session ID: ${updateError}`);
          // გაგრძელება ჩავარდნის მიუხედავად, რადგან სესია მაინც შეიქმნა
        }
        
        response.status(200).json({ url: session.url });
      } else {
        logger.error("Stripe session URL is null");
        response.status(500).json({ error: "Failed to create payment session: No URL returned." });
      }
    } catch (error) {
      logger.error("Error creating Stripe Checkout session:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      response.status(500).json({ error: `Failed to create payment session: ${errorMessage}` });
    }
  }
);

// Stripe webhook handler - დაამუშავებს webhook-ებს Stripe-დან და განაახლებს გადახდის სტატუსს
export const stripeWebhook = onRequest(
  { cors: true },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).send("Method Not Allowed");
      return;
    }

    const sig = request.headers['stripe-signature'];
    if (!sig) {
      response.status(400).send('Webhook Error: No Stripe signature found');
      return;
    }

    let event;

    try {
      // შევამოწმოთ webhook-ის ხელმოწერა
      const payload = request.rawBody || 
        (request.body ? 
          (typeof request.body === 'string' ? 
            request.body : 
            JSON.stringify(request.body)) : 
          '');
      
      // შევამოწმოთ webhook-ის ხელმოწერა Stripe-ის მხრიდან
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "whsec_NDPD0J2WxhR1DNGjUdIBVY7L4196w6Ok";
      event = stripe.webhooks.constructEvent(payload, sig, webhookSecret);
      
      logger.info('Webhook verified:', event.type);

      // დავამუშავოთ კონკრეტული ივენთები
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        
        // გადავამოწმოთ გადახდის სტატუსი
        if (session.payment_status === 'paid') {
          // მივიღოთ მეტა-მონაცემები session-დან
          const chatId = session.metadata?.chatId;
          const userId = session.metadata?.userId;
          const productId = session.metadata?.productId;
          const serviceFee = parseFloat(session.metadata?.serviceFee || '0');
          
          if (chatId) {
            logger.info(`Payment completed for chat: ${chatId}, user: ${userId}, product: ${productId}, fee: $${serviceFee}`);
            
            try {
              // 1. განვაახლოთ ჩატის სტატუსი Firestore-ში
              await admin.firestore().collection('chats').doc(chatId).update({
                paymentCompleted: true,
                paymentCompletedAt: Date.now(),
                paymentStatus: 'completed',
                paymentSessionId: session.id,
                feeAmount: serviceFee,
                totalAmount: parseFloat(session.metadata?.totalAmount || '0'),
                productPrice: parseFloat(session.metadata?.productPrice || '0')
              });
              logger.info(`Payment status updated for chat: ${chatId}`);
              
              // 2. შევქმნათ ახალი ჩანაწერი paid კოლექციაში
              // მივიღოთ მყიდველის სახელი
              const userDoc = await admin.firestore().collection('users').doc(userId || '').get();
              const buyerName = userDoc.exists ? userDoc.data()?.name || "Unknown User" : "Unknown User";
              
              // მივიღოთ ჩატის ინფორმაცია და გამყიდველის მონაცემები
              const chatDoc = await admin.firestore().collection('chats').doc(chatId || '').get();
              const chatData = chatDoc.exists ? chatDoc.data() : {};
              const chatName = chatData?.name || "Chat";
              
              // გამყიდველის ინფორმაცია (ვარაუდობთ რომ ჩატის მონაცემებში შეიძლება იყოს sellerId ან ან userId რომელიც არ არის მყიდველი)
              let sellerId = chatData?.sellerId || '';
              if (!sellerId && chatData?.participants) {
                // თუ არ გვაქვს პირდაპირ sellerId, ვიპოვოთ პირველი მონაწილე რომელიც არ არის მყიდველი
                sellerId = chatData.participants.find((id: string) => id !== userId) || '';
              }
              
              // მივიღოთ გამყიდველის სახელი
              let sellerName = "Unknown Seller";
              if (sellerId) {
                const sellerDoc = await admin.firestore().collection('users').doc(sellerId).get();
                sellerName = sellerDoc.exists ? sellerDoc.data()?.name || "Unknown Seller" : "Unknown Seller";
              }
              
              await admin.firestore().collection('paid').add({
                chatId: chatId,
                userId: userId,
                productId: productId,
                paymentSessionId: session.id,
                amount: serviceFee,
                totalAmount: parseFloat(session.metadata?.totalAmount || '0'),
                productPrice: parseFloat(session.metadata?.productPrice || '0'),
                status: 'completed',
                paymentMethod: 'stripe',
                currency: 'usd',
                createdAt: Date.now(),
                stripeSessionId: session.id,
                buyerName: buyerName,
                sellerId: sellerId,
                sellerName: sellerName,
                chatName: chatName
              });
              logger.info(`Payment record added to 'paid' collection for chat: ${chatId}`);
              
              // 3. დავამატოთ ნოტიფიკაცია ადმინისტრატორებისთვის
              try {
                // მივიღოთ პროდუქტის სახელი
                const productDoc = await admin.firestore().collection('products').doc(productId || '').get();
                const productName = productDoc.exists ? productDoc.data()?.displayName || "Unknown Product" : "Unknown Product";
                
                // მივიღოთ მყიდველის სახელი
                const userDoc = await admin.firestore().collection('users').doc(userId || '').get();
                const buyerName = userDoc.exists ? userDoc.data()?.name || "Unknown User" : "Unknown User";
                
                // შევქმნათ ადმინისტრატორის შეტყობინება
                await admin.firestore().collection('admin_notifications').add({
                  type: 'payment_completed',
                  chatId: chatId || '',
                  productId: productId || '',
                  productName: productName,
                  buyerId: userId || '',
                  buyerName: buyerName,
                  paymentSessionId: session.id,
                  paymentAmount: serviceFee,
                  createdAt: Date.now(),
                  read: false,
                  priority: 'high',
                  needsAction: true,
                  status: 'pending_review'
                });
                
                logger.info(`Admin notification created for payment: ${session.id}`);
                
                // დავაგზავნოთ შეტყობინება რეალურ დროში
                await admin.database().ref(`adminNotifications/payment_${Date.now()}`).set({
                  type: 'payment_completed',
                  chatId: chatId || '',
                  productId: productId || '',
                  productName: productName,
                  timestamp: Date.now(),
                  amount: serviceFee
                });
                
                logger.info(`Real-time admin notification sent for payment: ${session.id}`);
              } catch (notificationError) {
                logger.error(`Failed to create admin notification: ${notificationError}`);
                // გაგრძელება ჩავარდნის მიუხედავად
              }
              
              // 4. დავამატოთ შეტყობინება ჩატში გადახდის შესახებ
              try {
                // ვიპოვოთ ჩატის მონაცემებში ადმინის ფოტოს URL, თუ არსებობს
                let adminPhotoURL = null;
                
                try {
                  const chatDocForAdmin = await admin.firestore().collection('chats').doc(chatId).get();
                  if (chatDocForAdmin.exists) {
                    const chatDataForAdmin = chatDocForAdmin.data();
                    adminPhotoURL = chatDataForAdmin?.adminPhotoURL || null;
                    
                    // თუ adminPhotoURL არ არის ჩატის მონაცემებში, მაგრამ გვაქვს adminId, ცალკე მოვძებნოთ
                    if (!adminPhotoURL && chatDataForAdmin?.adminId) {
                      const adminDoc = await admin.firestore().collection('users').doc(chatDataForAdmin.adminId).get();
                      if (adminDoc.exists) {
                        adminPhotoURL = adminDoc.data()?.photoURL || null;
                      }
                    }
                  }
                } catch (adminErr) {
                  logger.warn(`Error fetching admin photo for payment confirmation: ${adminErr}`);
                  // გავაგრძელოთ შეცდომის მიუხედავად
                }
                
                const rtdbRef = admin.database().ref(`messages/${chatId}`);
                await rtdbRef.push({
                  text: `✅ Payment Confirmed!\nTransaction of $${parseFloat(session.metadata?.totalAmount || '0')} (product price $${parseFloat(session.metadata?.productPrice || '0')} + fee $${serviceFee}) has been successfully processed. The seller has been notified about the payment and is required to provide the account details according to the agreement.`,
                  senderId: "system",
                  senderName: "System",
                  timestamp: Date.now(),
                  isSystem: true,
                  isPaymentConfirmation: true,
                  senderPhotoURL: adminPhotoURL // დავამატოთ ადმინის ფოტო URL მესიჯზე, თუ ვიპოვეთ
                });
                logger.info(`Payment confirmation message added to chat: ${chatId}`);
              } catch (messageError) {
                logger.error(`Failed to add payment confirmation message: ${messageError}`);
              }

            } catch (err) {
              logger.error(`Failed to update chat payment status: ${err}`);
            }
          } else {
            logger.error('Missing chatId in session metadata');
          }
        } else {
          logger.info(`Payment not yet paid for session: ${session.id}, status: ${session.payment_status}`);
        }
      }

      // დადასტურების გაგზავნა Stripe-ისთვის
      response.json({ received: true });
    } catch (err) {
      logger.error('Webhook signature verification failed:', err);
      response.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }
);

// ახალი ფუნქცია: ადმინის ჩატში შემოსვლის შემდეგ ტაიმერის დაწყებისთვის
export const startTransferTimer = onCall({ 
  enforceAppCheck: false 
}, async (request) => {
  try {
    // აუთენტიფიკაციის შემოწმება
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }
    
    const { chatId } = request.data;
    
    if (!chatId) {
      throw new HttpsError('invalid-argument', 'Chat ID is required.');
    }
    
    logger.info(`Starting 7-day transfer timer for chat: ${chatId}`);
    
    // შევამოწმოთ ჩატის არსებობა და მომხმარებლის უფლებები
    const chatDoc = await admin.firestore().collection('chats').doc(chatId).get();
    
    if (!chatDoc.exists) {
      throw new HttpsError('not-found', 'Chat not found.');
    }
    
    const chatData = chatDoc.data();
    
    // გარკვეული შემოწმებები: მაგ., ადმინი ჩართულია ჩატში, მყიდველმა უკვე გადაიხადა, და ა.შ.
    if (!chatData?.adminJoined) {
      throw new HttpsError('failed-precondition', 'No admin has joined this chat yet.');
    }

    if (!chatData?.paymentCompleted) {
      throw new HttpsError('failed-precondition', 'Payment must be completed before starting transfer timer.');
    }
    
    // გამოვთვალოთ ტაიმერის დასრულების დრო - 7 დღის შემდეგ
    const now = Date.now();
    const transferReadyTime = now + (7 * 24 * 60 * 60 * 1000); // 7 დღე მილისეკუნდებში
    
    // განვაახლოთ ჩატის მონაცემები ტაიმერის დაწყებით
    await admin.firestore().collection('chats').doc(chatId).update({
      transferTimerStarted: true,
      transferTimerStartedAt: now,
      transferReadyTime: transferReadyTime,
      transferStatus: 'pending',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // ვიპოვოთ ადმინის მონაცემები, რომ დავამატოთ მისი ფოტო შეტყობინებას
    const chatAdminId = chatData?.adminId;
    let adminPhotoURL = chatData?.adminPhotoURL || null;
    
    // თუ adminPhotoURL არ არის ჩატის მონაცემებში, მაგრამ გვაქვს adminId, ცალკე მოვძებნოთ
    if (!adminPhotoURL && chatAdminId) {
      try {
        const adminDoc = await admin.firestore().collection('users').doc(chatAdminId).get();
        if (adminDoc.exists) {
          adminPhotoURL = adminDoc.data()?.photoURL || null;
        }
      } catch (err) {
        logger.warn(`Error fetching admin photo URL: ${err}`);
        // გავაგრძელოთ შეცდომის მიუხედავად
      }
    }
    
    // დავამატოთ სისტემური შეტყობინება ჩატში ტაიმერის დაწყების შესახებ
    const rtdbRef = admin.database().ref(`messages/${chatId}`);
    await rtdbRef.push({
      text: `⏱️ Primary ownership rights transfer timer started. The transfer will be possible in 7 days.`,
      senderId: "system",
      senderName: "System",
      timestamp: now,
      isSystem: true,
      senderPhotoURL: adminPhotoURL // დავამატოთ ადმინის ფოტო URL, რომ გამოჩნდეს მესიჯთან ერთად
    });

    logger.info(`Transfer timer started for chat ${chatId}, will be ready at: ${new Date(transferReadyTime).toISOString()}`);
    
    return {
      success: true,
      transferReadyTime: transferReadyTime
    };
    
  } catch (error) {
    logger.error(`Error starting transfer timer:`, error);
    throw new HttpsError('internal', 'Failed to start transfer timer: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
});

// ფუნქცია ადმინისტრატორის დაპატიჟებისთვის ახალ ჩატში
export const inviteAdminToPrivateChat = onCall({ 
  enforceAppCheck: false 
}, async (request) => {
  try {
    // აუთენტიფიკაციის შემოწმება
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }
    
    const { chatId, adminEmail, transactionId, initialMessage, productName } = request.data;
    
    if (!chatId || !adminEmail) {
      throw new HttpsError('invalid-argument', 'Chat ID and admin email are required.');
    }
    
    // შევამოწმოთ მიწვევის მცდელობის კანონიერება
    const currentUserId = auth.uid;
    
    // შევამოწმოთ ჩატის არსებობა და მომხმარებლის უფლებები
    const chatDoc = await admin.firestore().collection('chats').doc(chatId).get();
    
    if (!chatDoc.exists) {
      throw new HttpsError('not-found', 'Chat not found.');
    }
    
    const chatData = chatDoc.data();
    
    // გარკვეული შემოწმებები, მათ შორის გამყიდველის იდენტიფიკაცია
    const participants = chatData?.participants || [];
    
    // თუ რამე ფორმით გვაქვს მითითებული გამყიდველის ID
    let sellerId = chatData?.sellerId;
    
    // თუ არ გვაქვს პირდაპირ მითითებული, ვიპოვოთ მონაწილეთა შორის
    if (!sellerId && participants.length > 1) {
      // ვარსიანტები:
      // 1. თუ ჩატში არის 2 მონაწილე, და ერთი მათგანი მიმდინარე მომხმარებელია, ის უნდა იყოს გამყიდველი
      if (participants.includes(currentUserId)) {
        // გავარკვიოთ, არის თუ არა მიმდინარე მომხმარებელი გამყიდველი
        sellerId = currentUserId;
      } else {
        throw new HttpsError('permission-denied', 'Only the seller can invite admins to a private chat.');
      }
    }
    
    // თუ მიმდინარე მომხმარებელი არ არის გამყიდველი, შევაჩეროთ
    if (sellerId !== currentUserId) {
      throw new HttpsError('permission-denied', 'Only the seller can invite admins to a private chat.');
    }
    
    // ვიპოვოთ ადმინის მონაცემები მეილის მიხედვით
    const usersSnapshot = await admin.firestore()
      .collection('users')
      .where('email', '==', adminEmail)
      .where('isAdmin', '==', true)
      .get();
    
    if (usersSnapshot.empty) {
      throw new HttpsError('not-found', 'No admin found with this email.');
    }
    
    const adminData = usersSnapshot.docs[0].data();
    const adminId = usersSnapshot.docs[0].id;
    const adminPhotoURL = adminData.photoURL || null; // ვიღებთ ადმინის ფოტოს URL
    
    // შევქმნათ ახალი პრივატული ჩატი გამყიდველსა და ადმინს შორის
    const newChatRef = admin.firestore().collection('chats').doc();
    const newChatId = newChatRef.id;
    
    const sellerDoc = await admin.firestore().collection('users').doc(sellerId).get();
    const sellerData = sellerDoc.data();
    const sellerName = sellerData?.name || "Unknown Seller";
    const sellerPhotoURL = sellerData?.photoURL || null;
    
    // ჩატის სახელი იქნება "ადმინის სახელი + გამყიდველის სახელი - Private"
    const chatName = `${adminData.name} & ${sellerName} - Private`;
    
    // ახალი ჩატის მონაცემები
    const now = Date.now();
    const privateChat = {
      id: newChatId,
      participants: [sellerId, adminId],
      participantNames: {
        [sellerId]: sellerName,
        [adminId]: adminData.name
      },
      name: chatName,
      participantPhotos: {
        [sellerId]: sellerPhotoURL,
        [adminId]: adminPhotoURL // ვინახავთ ადმინის ფოტოს URL ჩატის მონაცემებში
      },
      createdAt: now,
      updatedAt: now,
      isPrivateWithAdmin: true,
      originalChatId: chatId,
      adminJoined: true,
      adminId: adminId,
      adminPhotoURL: adminPhotoURL, // ვინახავთ ადმინის ფოტოს URL ცალკე ველადაც
      sellerId: sellerId,
      productId: chatData?.productId || '',
      productName: chatData?.productName || productName || 'Unknown Product'
    };
    
    // მოვძებნოთ ადმინის დოკუმენტი, რომ მივიღოთ მისი სურათი
    let adminUserDoc;
    try {
      adminUserDoc = await admin.firestore().collection('users').doc(adminId).get();
    } catch (err) {
      logger.warn(`Error fetching admin user document: ${err}`);
    }

    // თუ ადმინს აქვს სურათი, ჩავამატოთ აქაც
    if (adminUserDoc && adminUserDoc.exists) {
      const adminUserData = adminUserDoc.data();
      if (adminUserData?.adminPhotoURL) {
        privateChat.adminPhotoURL = adminUserData.adminPhotoURL;
      } else if (adminUserData?.photoURL) {
        privateChat.adminPhotoURL = adminUserData.photoURL;
      }
    }
    
    // შევინახოთ ახალი ჩატი
    await newChatRef.set(privateChat);
    
    // დავამატოთ პირველი სისტემური შეტყობინება ახალ ჩატში
    const rtdbRef = admin.database().ref(`messages/${newChatId}`);
    const welcomeMessage = {
      text: initialMessage || `Seller has invited escrow agent to assist with Transaction #${transactionId || chatId.substring(0, 6)}.\nInvited admin: ${adminEmail}`,
      senderId: "system",
      senderName: "System",
      timestamp: now,
      isSystem: true,
      senderPhotoURL: adminPhotoURL // ვამატებთ ადმინის ფოტოს მესიჯზე
    };
    
    await rtdbRef.push(welcomeMessage);
    
    // განვაახლოთ ორიგინალური ჩატის მონაცემები, რომ მივუთითოთ პრივატული ჩატის არსებობა
    await admin.firestore().collection('chats').doc(chatId).update({
      hasPrivateAdminChat: true,
      privateAdminChatId: newChatId,
      privateAdminChatCreatedAt: now,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      // ასევე შევინახოთ ადმინის ინფორმაცია ძირითად ჩატში საჭიროებისამებრ
      adminId: adminId,
      // უპირატესობა მივანიჭოთ adminPhotoURL-ს თუ გვაქვს (ეს უკვე შეიცავს ჩვენ მიერ ატვირთულ ფოტოს)
      adminPhotoURL: privateChat.adminPhotoURL || adminPhotoURL
    });
    
    // დავამატოთ შეტყობინება ორიგინალ ჩატშიც
    const originalChatRtdbRef = admin.database().ref(`messages/${chatId}`);
    await originalChatRtdbRef.push({
      text: `The seller has invited an escrow agent (${adminData.name}) to assist with this transaction.`,
      senderId: "system",
      senderName: "System",
      timestamp: now,
      isSystem: true,
      senderPhotoURL: adminPhotoURL // ვამატებთ ადმინის ფოტოს მესიჯზე
    });
    
    logger.info(`Private admin chat created: ${newChatId} between seller ${sellerId} and admin ${adminId}`);
    
    return {
      success: true,
      privateChatId: newChatId
    };
    
  } catch (error) {
    logger.error(`Error inviting admin to private chat:`, error);
    throw new HttpsError('internal', 'Failed to invite admin: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
});

// ფუნქცია, რომელიც დააბრუნებს ყველა ადმინის მეილებს
export const getAdminEmails = onCall({ 
  enforceAppCheck: false 
}, async (request) => {
  try {
    // აუთენტიფიკაციის შემოწმება
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }
    
    // მხოლოდ მეილების მიღება
    const usersSnapshot = await admin.firestore()
      .collection('users')
      .where('isAdmin', '==', true)
      .get();
    
    if (usersSnapshot.empty) {
      return { adminEmails: [] };
    }
    
    const adminEmails = usersSnapshot.docs.map(doc => {
      const userData = doc.data();
      return userData.email || '';
    }).filter(email => email !== ''); // მივიღოთ მხოლოდ ვალიდური მეილები
    
    return { adminEmails };
    
  } catch (error) {
    logger.error(`Error fetching admin emails:`, error);
    throw new HttpsError('internal', 'Failed to fetch admin emails: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
});

// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
