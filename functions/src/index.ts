import {onRequest} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import Stripe from "stripe";
import {onCall} from "firebase-functions/v2/https";
import {HttpsError} from "firebase-functions/v2/https";
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Firebase Admin SDK
admin.initializeApp();

// Stripe keys from environment variables
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

// HTTP function to create a Stripe Checkout session
export const createPaymentSessionHttp = onRequest(
  {cors: true},
  async (request, response) => {
    logger.info("createPaymentSessionHttp function triggered", {body: request.body});

    if (request.method !== "POST") {
      response.status(405).send("Method Not Allowed");
      return;
    }

    try {
      // Use direct Stripe key instead of fetching from Secret Manager
      const stripe = new Stripe(STRIPE_SECRET_KEY, {
        apiVersion: "2022-11-15" as Stripe.StripeConfig["apiVersion"],
      });

      const {chatId, userId, origin} = request.body;

      if (!chatId || !userId || !origin) {
        logger.error("Missing required parameters: chatId, userId, or origin");
        response.status(400).json({error: "Missing required parameters."});
        return;
      }

      logger.info("Fetching chat data for ID:", chatId);
      const chatDoc = await admin.firestore().collection("chats").doc(chatId).get();

      if (!chatDoc.exists) {
        logger.error(`Chat with ID ${chatId} not found`);
        response.status(404).json({error: "Chat not found"});
        return;
      }

      const chatData = chatDoc.data();
      const productId = chatData?.productId;

      if (!productId) {
        logger.error(`Product ID not found in chat ${chatId}`);
        response.status(404).json({error: "Product ID not found in chat"});
        return;
      }

      logger.info(`Fetching product data for ID: ${productId}`);
      const productDoc = await admin.firestore().collection("products").doc(productId).get();

      if (!productDoc.exists) {
        logger.error(`Product with ID ${productId} not found`);
        response.status(404).json({error: "Product not found"});
        return;
      }

      const productData = productDoc.data();
      const productPrice = productData?.price || 0;
      const productName = productData?.displayName || "Unknown Product";

      logger.info(`Product price: $${productPrice}, name: ${productName}`);

      const serviceFeePercent = 0.08; // 8%
      let calculatedServiceFee = productPrice * serviceFeePercent;

      // თუ 8% 3 დოლარზე ნაკლებია, საკომისიო იქნება 3 დოლარი
      if (calculatedServiceFee < 3) {
        calculatedServiceFee = 3;
      }
      
      // დამრგვალება ორ ათწილადამდე
      const roundedServiceFee = Math.round(calculatedServiceFee * 100) / 100;

      logger.info(`Calculated service fee: $${roundedServiceFee} (Logic: 8% of $${productPrice}, min $3)`);

      // მომხმარებელი იხდის მხოლოდ სერვისის საკომისიოს
      const totalAmount = roundedServiceFee;
      const roundedTotalAmount = Math.round(totalAmount * 100) / 100;

      logger.info(`Total amount: $${roundedTotalAmount} (Only service fee: $${roundedServiceFee})`);

      const priceInCents = Math.round(roundedTotalAmount * 100);
      const currency = "usd";
      const productDescription = `${productName} - ${serviceFeePercent * 100}% სერვისის საკომისიო`;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: currency,
              product_data: {
                name: `${productName} - სერვისის საკომისიო`,
                description: productDescription,
              },
              unit_amount: priceInCents,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${origin}/my-chats?chatId=${chatId}&payment=success`,
        cancel_url: `${origin}/my-chats?chatId=${chatId}&payment=cancelled`,
        client_reference_id: chatId,
        metadata: {
          chatId: chatId,
          userId: userId,
          productId: productId,
          productPrice: productPrice.toString(),
          serviceFee: roundedServiceFee.toString(),
          totalAmount: roundedTotalAmount.toString(),
        },
      });

      if (session.url) {
        logger.info("Stripe Checkout session created successfully:", {sessionId: session.id, url: session.url});

        try {
          await admin.firestore().collection("chats").doc(chatId).update({
            paymentSessionId: session.id,
            paymentStatus: "pending",
            feeAmount: roundedServiceFee,
            totalAmount: parseFloat(session.metadata?.totalAmount || "0"),
            productPrice: parseFloat(session.metadata?.productPrice || "0"),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          logger.info(`Updated chat ${chatId} with paymentSessionId ${session.id}`);
        } catch (updateError) {
          logger.error(`Failed to update chat with session ID: ${updateError}`);
        }

        response.status(200).json({url: session.url});
      } else {
        logger.error("Stripe session URL is null");
        response.status(500).json({error: "Failed to create payment session: No URL returned."});
      }
    } catch (error) {
      logger.error("Error creating Stripe Checkout session:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      response.status(500).json({error: `Failed to create payment session: ${errorMessage}`});
    }
  }
);

// Stripe webhook handler
export const stripeWebhook = onRequest(
  {cors: true},
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).send("Method Not Allowed");
      return;
    }

    const sig = request.headers["stripe-signature"];
    if (!sig) {
      response.status(400).send("Webhook Error: No Stripe signature found");
      return;
    }

    let event;

    try {
      // Use direct keys instead of fetching from Secret Manager
      const stripe = new Stripe(STRIPE_SECRET_KEY, {
        apiVersion: "2022-11-15" as Stripe.StripeConfig["apiVersion"],
      });

      const payload =
        request.rawBody ||
        (request.body
          ? typeof request.body === "string"
            ? request.body
            : JSON.stringify(request.body)
          : "");

      event = stripe.webhooks.constructEvent(payload, sig, STRIPE_WEBHOOK_SECRET);
      logger.info("Webhook verified:", event.type);

      if (event.type === "checkout.session.completed") {
        const session = event.data.object;

        if (session.payment_status === "paid") {
          const chatId = session.metadata?.chatId;
          const buyerId = session.metadata?.userId;
          const productId = session.metadata?.productId;
          const serviceFee = parseFloat(session.metadata?.serviceFee || "0");

          if (chatId) {
            logger.info(`Payment completed for chat: ${chatId}, user: ${buyerId}, product: ${productId}, fee: $${serviceFee}`);

            try {
              const chatDocRef = admin.firestore().collection("chats").doc(chatId);
              const chatDocSnapshot = await chatDocRef.get();
              
              let effectiveSellerId: string | undefined = undefined;
              const currentChatData = chatDocSnapshot.exists ? chatDocSnapshot.data()! : null;

              if (currentChatData) {
                if (currentChatData.sellerId) {
                  effectiveSellerId = currentChatData.sellerId;
                } else if (currentChatData.participants && buyerId) {
                  effectiveSellerId = currentChatData.participants.find((pId: string) => pId !== buyerId);
                }
              }

              const updatePayload: { [key: string]: any } = {
                paymentCompleted: true,
                paymentCompletedAt: Date.now(),
                paymentStatus: "completed",
                paymentSessionId: session.id,
                feeAmount: serviceFee,
                totalAmount: parseFloat(session.metadata?.totalAmount || "0"),
                productPrice: parseFloat(session.metadata?.productPrice || "0"),
              };

              if (effectiveSellerId && (!currentChatData || !currentChatData.sellerId)) {
                updatePayload.sellerId = effectiveSellerId;
              }

              await chatDocRef.update(updatePayload);
              logger.info(`Payment status updated for chat: ${chatId}.${updatePayload.sellerId ? ` SellerId was also updated to ${updatePayload.sellerId}.` : ''}`);
              
              const userDoc = await admin.firestore().collection("users").doc(buyerId || "").get();
              const buyerName = userDoc.exists ? userDoc.data()?.name || "Unknown User" : "Unknown User";

              const updatedChatInfoDoc = await chatDocRef.get();
              const chatDataForPaidRecord = updatedChatInfoDoc.exists ? updatedChatInfoDoc.data()! : {};
              const chatName = chatDataForPaidRecord.name || "Chat";
              
              let sellerName = "Unknown Seller";
              if (effectiveSellerId) {
                const sellerDoc = await admin.firestore().collection("users").doc(effectiveSellerId).get();
                sellerName = sellerDoc.exists ? sellerDoc.data()?.name || "Unknown Seller" : "Unknown Seller";
              }

              await admin.firestore().collection("paid").add({
                chatId: chatId,
                userId: buyerId,
                productId: productId,
                paymentSessionId: session.id,
                amount: serviceFee,
                totalAmount: parseFloat(session.metadata?.totalAmount || "0"),
                productPrice: parseFloat(session.metadata?.productPrice || "0"),
                status: "completed",
                paymentMethod: "stripe",
                currency: "usd",
                createdAt: Date.now(),
                stripeSessionId: session.id,
                buyerName: buyerName,
                sellerId: effectiveSellerId,
                sellerName: sellerName,
                chatName: chatName,
              });
              logger.info(`Payment record added to 'paid' collection for chat: ${chatId}`);

              try {
                const productDoc = await admin.firestore().collection("products").doc(productId || "").get();
                const productName = productDoc.exists ? productDoc.data()?.displayName || "Unknown Product" : "Unknown Product";

                await admin.firestore().collection("admin_notifications").add({
                  type: "payment_completed",
                  chatId: chatId || "",
                  productId: productId || "",
                  productName: productName,
                  buyerId: buyerId || "",
                  buyerName: buyerName,
                  paymentSessionId: session.id,
                  paymentAmount: serviceFee,
                  createdAt: Date.now(),
                  read: false,
                  priority: "high",
                  needsAction: true,
                  status: "pending_review",
                });
                logger.info(`Admin notification created for payment: ${session.id}`);

                await admin.database().ref(`adminNotifications/payment_${Date.now()}`).set({
                  type: "payment_completed",
                  chatId: chatId || "",
                  productId: productId || "",
                  productName: productName,
                  timestamp: Date.now(),
                  amount: serviceFee,
                });
                logger.info(`Real-time admin notification sent for payment: ${session.id}`);
              } catch (notificationError) {
                logger.error(`Failed to create admin notification: ${notificationError}`);
              }

              try {
                let adminPhotoURL = null;
                const chatDocForAdmin = await admin.firestore().collection("chats").doc(chatId).get();
                if (chatDocForAdmin.exists) {
                  const chatDataForAdmin = chatDocForAdmin.data();
                  adminPhotoURL = chatDataForAdmin?.adminPhotoURL || null;

                  if (!adminPhotoURL && chatDataForAdmin?.adminId) {
                    const adminDoc = await admin.firestore().collection("users").doc(chatDataForAdmin.adminId).get();
                    if (adminDoc.exists) {
                      adminPhotoURL = adminDoc.data()?.photoURL || null;
                    }
                  }
                }

                logger.info(`Payment confirmation logic removed for chat: ${chatId}`);
              } catch (messageError) {
                logger.error(`Failed to process payment confirmation: ${messageError}`);
              }
            } catch (err) {
              logger.error(`Failed to update chat payment status: ${err}`);
            }
          } else {
            logger.error("Missing chatId in session metadata");
          }
        } else {
          logger.info(`Payment not yet paid for session: ${session.id}, status: ${session.payment_status}`);
        }
      }

      response.json({received: true});
    } catch (err) {
      logger.error("Webhook signature verification failed:", err);
      response.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }
);

// Function to start a 7-day transfer timer
export const startTransferTimer = onCall(
  {enforceAppCheck: false},
  async (request) => {
    try {
      const auth = request.auth;
      if (!auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated.");
      }

      const {chatId} = request.data;

      if (!chatId) {
        throw new HttpsError("invalid-argument", "Chat ID is required.");
      }

      logger.info(`Starting 7-day transfer timer for chat: ${chatId}`);

      const chatDoc = await admin.firestore().collection("chats").doc(chatId).get();

      if (!chatDoc.exists) {
        throw new HttpsError("not-found", "Chat not found.");
      }

      const chatData = chatDoc.data();

      // შევამოწმოთ, რომ თვითონ ადმინი იწყებს ტაიმერს
      const userId = auth.uid;
      const userDoc = await admin.firestore().collection("users").doc(userId).get();
      
      if (!userDoc.exists) {
        throw new HttpsError("not-found", "User not found.");
      }
      
      const userData = userDoc.data();
      if (!userData?.isAdmin) {
        throw new HttpsError("permission-denied", "Only admins can start the transfer timer.");
      }

      if (!chatData?.paymentCompleted) {
        throw new HttpsError("failed-precondition", "Payment must be completed before starting transfer timer.");
      }

      const now = Date.now();
      const transferReadyTime = now + 7 * 24 * 60 * 60 * 1000;

      await admin.firestore().collection("chats").doc(chatId).update({
        transferTimerStarted: true,
        transferTimerStartedAt: now,
        transferReadyTime: transferReadyTime,
        transferStatus: "pending",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        adminJoined: true, // ყოველთვის დავაყენოთ ეს ფლაგი
        adminId: userId // შევინახოთ ადმინის ID
      });

      const chatAdminId = chatData?.adminId;
      let adminPhotoURL = chatData?.adminPhotoURL || null;

      if (!adminPhotoURL && chatAdminId) {
        try {
          const adminDoc = await admin.firestore().collection("users").doc(chatAdminId).get();
          if (adminDoc.exists) {
            adminPhotoURL = adminDoc.data()?.photoURL || null;
          }
        } catch (err) {
          logger.warn(`Error fetching admin photo URL: ${err}`);
        }
      }

      return {
        success: true,
        transferReadyTime: transferReadyTime
      };
    } catch (error) {
      logger.error("Error starting transfer timer:", error);
      throw new HttpsError("internal", "Failed to start transfer timer: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  }
);

// Function to invite an admin to a private chat
export const inviteAdminToPrivateChat = onCall(
  {enforceAppCheck: false},
  async (request) => {
    try {
      const auth = request.auth;
      if (!auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated.");
      }

      const {chatId, adminEmail, transactionId, initialMessage, productName} = request.data;

      if (!chatId || !adminEmail) {
        throw new HttpsError("invalid-argument", "Chat ID and admin email are required.");
      }

      const currentUserId = auth.uid;
      const chatDoc = await admin.firestore().collection("chats").doc(chatId).get();

      if (!chatDoc.exists) {
        throw new HttpsError("not-found", "Chat not found.");
      }

      const chatData = chatDoc.data();
      const participants = chatData?.participants || [];
      let sellerId = chatData?.sellerId;

      if (!sellerId && participants.length > 1) {
        if (participants.includes(currentUserId)) {
          sellerId = currentUserId;
        } else {
          throw new HttpsError("permission-denied", "Only the seller can invite admins to a private chat.");
        }
      }

      if (sellerId !== currentUserId) {
        throw new HttpsError("permission-denied", "Only the seller can invite admins to a private chat.");
      }

      const usersSnapshot = await admin.firestore().collection("users").where("email", "==", adminEmail).where("isAdmin", "==", true).get();

      if (usersSnapshot.empty) {
        throw new HttpsError("not-found", "No admin found with this email.");
      }

      const adminData = usersSnapshot.docs[0].data();
      const adminId = usersSnapshot.docs[0].id;
      const adminPhotoURL = adminData.photoURL || null;

      const newChatRef = admin.firestore().collection("chats").doc();
      const newChatId = newChatRef.id;

      const sellerDoc = await admin.firestore().collection("users").doc(sellerId).get();
      const sellerData = sellerDoc.data();
      const sellerName = sellerData?.name || "Unknown Seller";
      const sellerPhotoURL = sellerData?.photoURL || null;

      const chatName = `${adminData.name} & ${sellerName} - Private`;
      const now = Date.now();
      const privateChat = {
        id: newChatId,
        participants: [sellerId, adminId],
        participantNames: {
          [sellerId]: sellerName,
          [adminId]: adminData.name,
        },
        name: chatName,
        participantPhotos: {
          [sellerId]: sellerPhotoURL,
          [adminId]: adminPhotoURL,
        },
        createdAt: now,
        updatedAt: now,
        isPrivateWithAdmin: true,
        originalChatId: chatId,
        adminJoined: true,
        adminId: adminId,
        adminPhotoURL: adminPhotoURL,
        sellerId: sellerId,
        productId: chatData?.productId || "",
        productName: chatData?.productName || productName || "Unknown Product",
      };

      let adminUserDoc;
      try {
        adminUserDoc = await admin.firestore().collection("users").doc(adminId).get();
      } catch (err) {
        logger.warn(`Error fetching admin user document: ${err}`);
      }

      if (adminUserDoc && adminUserDoc.exists) {
        const adminUserData = adminUserDoc.data();
        if (adminUserData?.adminPhotoURL) {
          privateChat.adminPhotoURL = adminUserData.adminPhotoURL;
        } else if (adminUserData?.photoURL) {
          privateChat.adminPhotoURL = adminUserData.photoURL;
        }
      }

      await newChatRef.set(privateChat);

      const rtdbRef = admin.database().ref(`messages/${newChatId}`);
      const welcomeMessage = {
        text: initialMessage || `გამყიდველმა მოიწვია ესქროუ აგენტი ტრანზაქციისთვის #${transactionId || chatId.substring(0, 6)}.\nმოწვეული ადმინი: ${adminEmail}`,
        senderId: "system",
        senderName: "System",
        timestamp: now,
        isSystem: true,
        senderPhotoURL: adminPhotoURL,
      };

      await rtdbRef.push(welcomeMessage);

      await admin.firestore().collection("chats").doc(chatId).update({
        hasPrivateAdminChat: true,
        privateAdminChatId: newChatId,
        privateAdminChatCreatedAt: now,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        adminId: adminId,
        adminPhotoURL: privateChat.adminPhotoURL || adminPhotoURL,
      });

      const originalChatRtdbRef = admin.database().ref(`messages/${chatId}`);
      await originalChatRtdbRef.push({
        text: `გამყიდველმა მოიწვია ესქროუ აგენტი (${adminData.name}) ამ ტრანზაქციის დასახმარებლად.`,
        senderId: "system",
        senderName: "System",
        timestamp: now,
        isSystem: true,
        senderPhotoURL: adminPhotoURL,
      });

      logger.info(`Private admin chat created: ${newChatId} between seller ${sellerId} and admin ${adminId}`);

      return {
        success: true,
        privateChatId: newChatId,
      };
    } catch (error) {
      logger.error("Error inviting admin to private chat:", error);
      throw new HttpsError("internal", "Failed to invite admin: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  }
);

// Function for an admin to officially join a chat
export const adminJoinChat = onCall(
  {enforceAppCheck: false},
  async (request) => {
    try {
      const auth = request.auth;
      if (!auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated.");
      }

      const {chatId} = request.data;

      if (!chatId) {
        throw new HttpsError("invalid-argument", "Chat ID is required.");
      }

      // Get user data to confirm they are an admin
      const userId = auth.uid;
      const userDoc = await admin.firestore().collection("users").doc(userId).get();
      
      if (!userDoc.exists) {
        throw new HttpsError("not-found", "User not found.");
      }
      
      const userData = userDoc.data();
      if (!userData?.isAdmin) {
        throw new HttpsError("permission-denied", "Only admins can join as an admin.");
      }

      const chatDoc = await admin.firestore().collection("chats").doc(chatId).get();
      if (!chatDoc.exists) {
        throw new HttpsError("not-found", "Chat not found.");
      }

      const chatData = chatDoc.data();
      
      // Check if the admin is assigned to this chat
      if (chatData?.adminId && chatData.adminId !== userId) {
        throw new HttpsError("permission-denied", "Another admin is already assigned to this chat.");
      }

      const now = Date.now();
      const adminName = userData.name || "Admin";
      const adminPhotoURL = userData.adminPhotoURL || userData.photoURL || null;

      await admin.firestore().collection("chats").doc(chatId).update({
        adminJoined: true,
        adminJoinedAt: now,
        adminId: userId,
        adminPhotoURL: adminPhotoURL,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info(`Admin ${userId} (${adminName}) joined chat ${chatId} at ${new Date(now).toISOString()}`);

      return {
        success: true,
        joinedAt: now,
      };
    } catch (error) {
      logger.error("Error joining chat as admin:", error);
      throw new HttpsError("internal", "Failed to join chat: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  }
);

// Function to fetch all admin emails
export const getAdminEmails = onCall(
  {enforceAppCheck: false},
  async (request) => {
    try {
      const auth = request.auth;
      if (!auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated.");
      }

      const usersSnapshot = await admin.firestore().collection("users").where("isAdmin", "==", true).get();

      if (usersSnapshot.empty) {
        return {adminEmails: []};
      }

      const adminEmails = usersSnapshot.docs
        .map((doc) => {
          const userData = doc.data();
          return userData.email || "";
        })
        .filter((email) => email !== "");

      return {adminEmails};
    } catch (error) {
      logger.error("Error fetching admin emails:", error);
      throw new HttpsError("internal", "Failed to fetch admin emails: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  }
);

// Function for seller to confirm offer
export const confirmSellerOffer = onCall(
  {enforceAppCheck: false}, // Consider enabling App Check for production
  async (request) => {
    try {
      const auth = request.auth;
      if (!auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated.");
      }

      const {chatId} = request.data;

      if (!chatId || typeof chatId !== "string") {
        throw new HttpsError("invalid-argument", "Chat ID is required and must be a string.");
      }

      const currentUserId = auth.uid;
      const chatDocRef = admin.firestore().collection("chats").doc(chatId);
      const chatDoc = await chatDocRef.get();

      if (!chatDoc.exists) {
        throw new HttpsError("not-found", "Chat not found.");
      }

      const chatData = chatDoc.data();
      if (!chatData) {
        throw new HttpsError("data-loss", "Chat data is missing.");
      }
      let sellerId = chatData.sellerId;

      // If sellerId is not directly set, but the current user is a participant,
      // and there isn't a different buyerId specified, assume current user is the seller.
      // This aligns with the scenario where a chat is created and sellerId might not be immediately set.
      if (!sellerId && chatData.participants.includes(currentUserId)) {
        // Check if there's a buyerId and if it's different from the current user.
        // If buyerId is the same as currentUserId, then this user is the buyer, not the seller.
        if (chatData.buyerId && chatData.buyerId === currentUserId) {
          // This case should ideally be caught by the buyer check later, 
          // but it's good to be explicit.
          throw new HttpsError("permission-denied", "Buyer cannot confirm the offer for the seller.");
        } else {
          // If no buyerId, or buyerId is different, assign current user as sellerId
          sellerId = currentUserId;
          // Optionally, update the chat document with this sellerId if it's a permanent assignment
          // await chatDocRef.update({ sellerId: currentUserId }); 
          // For now, we'll just use it for this function's logic.
        }
      }

      // Basic check: if sellerId field exists (or was just set), current user must match it
      if (sellerId && sellerId !== currentUserId) {
        throw new HttpsError("permission-denied", "Only the seller can confirm the offer.");
      }

      // More robust check if sellerId is not directly set but can be inferred from participants
      // This logic depends on how sellerId is determined in your application
      // This part needs to align with your app's logic for identifying the seller.
      // For now, we'll assume if sellerId is not present, we look at participants.
      // A common pattern is that the chat initiator (often the buyer) is one participant,
      // and the product owner (seller) is the other.
      // If there's no clear `buyerId` in chatData, this check is more complex.
      // Let's assume for this example that if currentUserId is a participant and not explicitly a buyer, they could be the seller.
      // This needs to be refined based on your exact data model.
      if (!chatData.participants.includes(currentUserId)) {
        throw new HttpsError("permission-denied", "User is not a participant in this chat.");
      }
      // If there are two participants and the current user is one of them,
      // and there's no explicit buyerId field, we might infer this user is the seller.
      // This is a simplification. In a real app, you'd have a clearer way to identify the seller.
      if (chatData.participants.length === 2 && !chatData.buyerId) {
        // Potentially the seller, let it pass for now.
        // Consider adding a specific check if product owner ID is stored in chatData.
      } else if (chatData.buyerId && chatData.buyerId === currentUserId) {
        throw new HttpsError("permission-denied", "Buyer cannot confirm the offer for the seller.");
      }
      // If not explicitly the sellerId and no other way to confirm, deny.
      // This logic is simplified. You should ensure sellerId is reliably set or inferable.
      if (!sellerId) {
        // If sellerId is not set after the above logic, and not in participants either (though covered above), deny.
        throw new HttpsError("failed-precondition", "Seller information is missing in the chat data and could not be inferred.");
      }

      if (chatData?.sellerConfirmed) {
        logger.info(`Offer for chat ${chatId} already confirmed by seller.`);
        // Optionally, you could throw an error or return a specific status
        // throw new HttpsError("failed-precondition", "Offer already confirmed.");
        return {success: true, message: "Offer already confirmed."};
      }

      await chatDocRef.update({
        sellerConfirmed: true,
        sellerConfirmedAt: admin.firestore.FieldValue.serverTimestamp(), // Use server timestamp
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info(`Seller ${currentUserId} confirmed offer for chat ${chatId}`);

      return {success: true};
    } catch (error: unknown) {
      logger.error("Error confirming seller offer:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError("internal", "Failed to confirm seller offer: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  }
);

// Function to assign manager rights to an escrow agent
export const assignManagerRightsToAdmin = onCall(
  {enforceAppCheck: false}, // Consider App Check for production
  async (request) => {
    try {
      const auth = request.auth;
      if (!auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated.");
      }

      const { chatId, adminEmail } = request.data;

      if (!chatId || typeof chatId !== "string") {
        throw new HttpsError("invalid-argument", "Chat ID is required and must be a string.");
      }
      if (!adminEmail || typeof adminEmail !== "string") {
        throw new HttpsError("invalid-argument", "Admin email is required and must be a string.");
      }

      const currentUserId = auth.uid;
      const chatDocRef = admin.firestore().collection("chats").doc(chatId);
      const chatDoc = await chatDocRef.get();

      if (!chatDoc.exists) {
        throw new HttpsError("not-found", "Chat not found.");
      }

      const chatData = chatDoc.data();
      if (!chatData) {
        throw new HttpsError("data-loss", "Chat data is missing.");
      }

      // Verify that the caller is the seller of the chat
      if (chatData.sellerId !== currentUserId) {
        throw new HttpsError("permission-denied", "Only the seller can assign manager rights.");
      }

      // Find the admin user by email
      const adminUsersSnapshot = await admin.firestore().collection("users").where("email", "==", adminEmail).where("isAdmin", "==", true).get();

      if (adminUsersSnapshot.empty) {
        throw new HttpsError("not-found", `Admin user with email ${adminEmail} not found or is not an admin.`);
      }
      const adminUserDoc = adminUsersSnapshot.docs[0];
      const adminId = adminUserDoc.id;

      const now = Date.now();
      await chatDocRef.update({
        escrowAgentAdminId: adminId,
        escrowAgentAdminEmail: adminEmail,
        escrowAgentAssignedAt: now,
        managerRightsAssigned: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info(`Manager rights for chat ${chatId} assigned to admin ${adminId} (${adminEmail}) by seller ${currentUserId}.`);

      // Create a notification for the admin
      await admin.firestore().collection("admin_notifications").add({
        type: "manager_rights_assigned",
        chatId: chatId,
        originalChatId: chatData.originalChatId || chatId, // If it's a private admin chat, link to original
        adminId: adminId,
        adminEmail: adminEmail,
        assignedBySellerId: currentUserId,
        productName: chatData.productName || "Unknown Product",
        timestamp: now,
        read: false,
        priority: "high",
        message: `Seller ${auth.token.name || currentUserId} has assigned you manager rights for chat: ${chatData.name || chatId}. Product: ${chatData.productName || "N/A"}.`,
      });
      logger.info(`Admin notification created for manager rights assignment in chat ${chatId} to admin ${adminId}.`);

      return { success: true, message: `Manager rights assigned to ${adminEmail}.` };

    } catch (error: unknown) {
      logger.error("Error assigning manager rights to admin:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError("internal", "Failed to assign manager rights: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  }
);