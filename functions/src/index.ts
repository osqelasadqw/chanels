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
      const minServiceFee = 3; // $3 minimum
      const serviceFee = Math.max(productPrice * serviceFeePercent, minServiceFee);
      const roundedServiceFee = Math.round(serviceFee * 100) / 100;

      logger.info(`Calculated service fee: $${roundedServiceFee} (${serviceFeePercent * 100}% of $${productPrice}, min $${minServiceFee})`);

      const totalAmount = productPrice + roundedServiceFee;
      const roundedTotalAmount = Math.round(totalAmount * 100) / 100;

      logger.info(`Total amount: $${roundedTotalAmount} (Product $${productPrice} + Fee $${roundedServiceFee})`);

      const priceInCents = Math.round(roundedTotalAmount * 100);
      const currency = "usd";
      const productDescription = `${productName} + ${serviceFeePercent * 100}% escrow service fee`;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: currency,
              product_data: {
                name: `${productName} + Escrow Service Fee`,
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
          const userId = session.metadata?.userId;
          const productId = session.metadata?.productId;
          const serviceFee = parseFloat(session.metadata?.serviceFee || "0");

          if (chatId) {
            logger.info(`Payment completed for chat: ${chatId}, user: ${userId}, product: ${productId}, fee: $${serviceFee}`);

            try {
              await admin.firestore().collection("chats").doc(chatId).update({
                paymentCompleted: true,
                paymentCompletedAt: Date.now(),
                paymentStatus: "completed",
                paymentSessionId: session.id,
                feeAmount: serviceFee,
                totalAmount: parseFloat(session.metadata?.totalAmount || "0"),
                productPrice: parseFloat(session.metadata?.productPrice || "0"),
              });
              logger.info(`Payment status updated for chat: ${chatId}`);

              const userDoc = await admin.firestore().collection("users").doc(userId || "").get();
              const buyerName = userDoc.exists ? userDoc.data()?.name || "Unknown User" : "Unknown User";

              const chatDoc = await admin.firestore().collection("chats").doc(chatId || "").get();
              const chatData = chatDoc.exists ? chatDoc.data() : {};
              const chatName = chatData?.name || "Chat";

              let sellerId = chatData?.sellerId || "";
              if (!sellerId && chatData?.participants) {
                sellerId = chatData.participants.find((id: string) => id !== userId) || "";
              }

              let sellerName = "Unknown Seller";
              if (sellerId) {
                const sellerDoc = await admin.firestore().collection("users").doc(sellerId).get();
                sellerName = sellerDoc.exists ? sellerDoc.data()?.name || "Unknown Seller" : "Unknown Seller";
              }

              await admin.firestore().collection("paid").add({
                chatId: chatId,
                userId: userId,
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
                sellerId: sellerId,
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
                  buyerId: userId || "",
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

      if (!chatData?.adminJoined) {
        throw new HttpsError("failed-precondition", "No admin has joined this chat yet.");
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

      const rtdbRef = admin.database().ref(`messages/${chatId}`);
      await rtdbRef.push({
        text: "⏱️ Primary ownership rights transfer timer started. The transfer will be possible in 7 days.",
        senderId: "system",
        senderName: "System",
        timestamp: now,
        isSystem: true,
        senderPhotoURL: adminPhotoURL,
      });

      logger.info(`Transfer timer started for chat ${chatId}, will be ready at: ${new Date(transferReadyTime).toISOString()}`);

      return {
        success: true,
        transferReadyTime: transferReadyTime,
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
        text: initialMessage || `Seller has invited escrow agent to assist with Transaction #${transactionId || chatId.substring(0, 6)}.\nInvited admin: ${adminEmail}`,
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
        text: `The seller has invited an escrow agent (${adminData.name}) to assist with this transaction.`,
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