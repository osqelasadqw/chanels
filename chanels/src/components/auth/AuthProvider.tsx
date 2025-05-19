"use client";

import { ReactNode, createContext, useContext, useEffect, useState } from "react";
import { 
  User as FirebaseUser, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as firebaseSignOut,
  onAuthStateChanged
} from "firebase/auth";
import { auth } from "@/firebase/config";
import { User } from "@/types/user";
import { isUserAdmin, createOrUpdateUser, ADMIN_EMAILS } from "@/firebase/userRoles";
import { serverTimestamp, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/firebase/config";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

// სახელის ამოღების ფუნქცია მეილიდან, თუ სახელი არ არის ხელმისაწვდომი
const getNameFromEmail = (email: string): string => {
  if (!email) return "";
  
  // მეილის პირველი ნაწილის აღება @ სიმბოლომდე
  const namePart = email.split('@')[0];
  
  // პირველი ასოს გადაყვანა მთავრული ასოთი და დანარჩენი სიტყვის დამატება
  return namePart.charAt(0).toUpperCase() + namePart.slice(1);
};

// ფუნქცია პროვაიდერის ტიპის დასადგენად
const determineAuthProvider = (firebaseUser: FirebaseUser): string => {
  const providerData = firebaseUser.providerData || [];
  
  if (providerData.length === 0) return "unknown";
  
  const providerId = providerData[0]?.providerId || "";
  
  // ვერცელის ავთენტიფიკაციის ამოცნობა
  if (providerId.includes("vercel") || providerId === "vercel.com") {
    return "vercel";
  }
  
  // გუგლის ავთენტიფიკაციის ამოცნობა
  if (providerId.includes("google") || providerId === "google.com") {
    return "google";
  }
  
  // GitHub-ის ავთენტიფიკაციის ამოცნობა
  if (providerId.includes("github") || providerId === "github.com") {
    return "github";
  }
  
  return providerId;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        try {
          console.log("Firebase user authenticated:", firebaseUser);
          const email = firebaseUser.email || "";
          const name = firebaseUser.displayName || "";
          const photoURL = firebaseUser.photoURL || "";
          
          // მომხმარებლის აუთენტიფიკაციის მომწოდებლის დადგენა
          const authProvider = determineAuthProvider(firebaseUser);
          console.log("Auth provider determined:", authProvider);
          
          // შევამოწმოთ არის თუ არა წინასწარ განსაზღვრული ადმინი
          const isPreDefinedAdmin = email && ADMIN_EMAILS.includes(email.toLowerCase());
          console.log("Is predefined admin:", isPreDefinedAdmin);
          
          // ვამოწმებთ არსებობს თუ არა მომხმარებელი Firestore-ში
          const userRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userRef);
          
          // მომხმარებლის სახელის დამუშავება
          const userName = name || getNameFromEmail(email);
          
          if (!userDoc.exists()) {
            console.log("User does not exist in Firestore, creating a new document");
            
            // შევქმნათ ახალი დოკუმენტი ყველა საჭირო მონაცემით
            const userData = {
              email: email,
              name: userName,
              photoURL: photoURL || null,
              admin: isPreDefinedAdmin,
              isAdmin: isPreDefinedAdmin,
              roles: { admin: isPreDefinedAdmin },
              createdAt: serverTimestamp(),
              lastLogin: serverTimestamp(),
              authProvider: authProvider
            };
            
            console.log("Creating new user with data:", userData);
            await setDoc(userRef, userData);
            console.log("New user document created successfully");
          } else {
            console.log("User exists in Firestore, updating lastLogin and other empty fields");
            
            // განვაახლოთ დოკუმენტი ბრძანებით
            const updateData: Record<string, any> = {
              lastLogin: serverTimestamp(),
            };

            // დავამატოთ ცარიელი ველები
            if (!userDoc.data()?.email) updateData.email = email;
            if (!userDoc.data()?.name) updateData.name = userName;
            if (!userDoc.data()?.photoURL && photoURL) updateData.photoURL = photoURL;
            
            // შევინახოთ ინფორმაცია ავთენტიფიკაციის პროვაიდერის შესახებ
            if (!userDoc.data()?.authProvider) {
              updateData.authProvider = authProvider;
            }
            
            // შევამოწმოთ და განვაახლოთ ადმინის სტატუსი წინასწარ განსაზღვრული სიის მიხედვით
            if (isPreDefinedAdmin) {
              updateData.admin = true;
              updateData.isAdmin = true;
              updateData.roles = { admin: true };
            }
            
            // უზრუნველვყოთ, რომ roles ობიექტი არსებობს
            if (!userDoc.data()?.roles) {
              updateData.roles = { admin: isPreDefinedAdmin };
            }
            
            console.log("Updating user with data:", updateData);
            
            // განვაახლოთ დოკუმენტი
            await updateDoc(userRef, updateData);
            console.log("User document updated successfully");
          }
          
          // Firestore-ში შევამოწმებთ არის თუ არა მომხმარებელი ადმინისტრატორი
          const isAdmin = await isUserAdmin(firebaseUser.uid);
          console.log("User admin status:", isAdmin);
          
          // დავაყენოთ მომხმარებლის ობიექტი
          setUser({
            id: firebaseUser.uid,
            email: email,
            name: userName,
            photoURL: photoURL || undefined,
            isAdmin
          });
        } catch (error) {
          console.error("Error in auth state change handler:", error);
          setUser({
            id: firebaseUser.uid,
            email: firebaseUser.email || "",
            name: firebaseUser.displayName || getNameFromEmail(firebaseUser.email || ""),
            photoURL: firebaseUser.photoURL || undefined,
            isAdmin: false
          });
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      setError(null);
      setLoading(true);
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      // პირველი რეგისტრაციის დროს შევქმნათ მომხმარებლის დოკუმენტი
      if (result.user) {
        const email = result.user.email || "";
        const isPreDefinedAdmin = email && ADMIN_EMAILS.includes(email.toLowerCase());
        
        await createOrUpdateUser(result.user.uid, {
          email: email,
          name: result.user.displayName || getNameFromEmail(email),
          photoURL: result.user.photoURL || undefined,
          admin: isPreDefinedAdmin || false,
          isAdmin: isPreDefinedAdmin || false,
          roles: { admin: isPreDefinedAdmin || false },
          createdAt: serverTimestamp(),
          lastLogin: serverTimestamp(),
          authProvider: "google"
        });
      }
    } catch (err) {
      setError("Failed to sign in with Google");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setLoading(true);
      await firebaseSignOut(auth);
    } catch (err) {
      setError("Failed to sign out");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}; 