import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './config';

// წინასწარ განსაზღვრული ადმინისტრატორების ელფოსტების სია
export const ADMIN_EMAILS: string[] = [
  "admin@example.com",
  "superadmin@example.com",
  "support@mateswap.com",
  "osqel@outlook.com",     // დაამატეთ თქვენი რეალური ადმინის მეილები
  "osqel@gmail.com",       // დაამატეთ თქვენი რეალური ადმინის მეილები
  // დაამატეთ აქ თქვენი ადმინისტრატორების ელფოსტები
];

// ფუნქცია, რომელიც საშუალებას გვაძლევს პროგრამულად დავამატოთ ახალი ადმინის მეილი
export const addAdminEmail = (email: string): boolean => {
  if (!email) return false;
  
  const normalizedEmail = email.toLowerCase().trim();
  if (ADMIN_EMAILS.includes(normalizedEmail)) {
    console.log(`Email ${email} is already in admin list`);
    return false;
  }
  
  ADMIN_EMAILS.push(normalizedEmail);
  console.log(`Added ${email} to admin list, now contains ${ADMIN_EMAILS.length} emails`);
  return true;
};

// ფუნქცია ელფოსტის ადმინის სიიდან წასაშლელად
export const removeAdminEmail = (email: string): boolean => {
  if (!email) return false;
  
  const normalizedEmail = email.toLowerCase().trim();
  const initialLength = ADMIN_EMAILS.length;
  
  const index = ADMIN_EMAILS.indexOf(normalizedEmail);
  if (index > -1) {
    ADMIN_EMAILS.splice(index, 1);
    console.log(`Removed ${email} from admin list`);
    return true;
  }
  
  console.log(`Email ${email} not found in admin list`);
  return false;
};

// მომხმარებლის როლების ტიპი
export type UserRole = 'user' | 'admin';

// ავთენტიფიკაციის პროვაიდერის ტიპები
export type AuthProvider = 'google' | 'vercel' | 'github' | 'unknown' | string;

// მომხმარებლის დოკუმენტის ტიპი Firestore-ში
export interface UserDocument {
  email: string;
  name: string;
  photoURL?: string;
  admin?: boolean; // პირდაპირ დოკუმენტში
  isAdmin?: boolean; // ალტერნატიული ველი admin-ისთვის
  roles?: {
    admin?: boolean;
  };
  createdAt: any; // Firestore Timestamp
  lastLogin: any; // Firestore Timestamp
  authProvider?: AuthProvider; // ავთენტიფიკაციის მომწოდებელი (google, vercel, და ა.შ.)
}

// შექმნის ან განაახლებს მომხმარებლის დოკუმენტს Firestore-ში
export const createOrUpdateUser = async (
  userId: string, 
  userData: Partial<UserDocument>
) => {
  console.log(`Attempting to create/update user document for: ${userId}`, userData);
  
  const userRef = doc(db, 'users', userId);
  const userDoc = await getDoc(userRef);
  
  if (!userDoc.exists()) {
    // თუ მომხმარებელი არ არსებობს, შევქმნათ
    console.log(`Creating new user document for: ${userId}`);
    try {
      await setDoc(userRef, userData);
      console.log(`Successfully created user document for: ${userId}`);
      return true;
    } catch (error) {
      console.error(`Error creating user document for: ${userId}`, error);
      throw error;
    }
  } else {
    // თუ მომხმარებელი არსებობს, განვაახლოთ
    console.log(`Updating existing user document for: ${userId}`);
    try {
      await updateDoc(userRef, userData);
      console.log(`Successfully updated user document for: ${userId}`);
      return true;
    } catch (error) {
      console.error(`Error updating user document for: ${userId}`, error);
      throw error;
    }
  }
};

// შეამოწმებს მომხმარებელს არის თუ არა ადმინისტრატორი
export const isUserAdmin = async (userId: string): Promise<boolean> => {
  try {
    console.log(`Checking admin status for user: ${userId}`);
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      const userData = userDoc.data() as UserDocument;
      
      // შევამოწმოთ არის თუ არა ელფოსტა წინასწარ განსაზღვრულ ადმინისტრატორების სიაში
      if (userData.email && ADMIN_EMAILS.includes(userData.email.toLowerCase())) {
        console.log(`User ${userId} with email ${userData.email} is in predefined admin list`);
        
        // განვაახლოთ მომხმარებლის დოკუმენტიც ამ ინფორმაციით
        await updateDoc(userRef, {
          'admin': true,
          'isAdmin': true,
          'roles': { admin: true }
        });
        
        return true;
      }
      
      // შევამოწმოთ როგორც პირდაპირ დოკუმენტის დონეზე, ასევე roles ობიექტის შიგნით
      const isAdmin = userData.admin === true || userData.isAdmin === true || userData.roles?.admin === true;
      console.log(`Admin status for user ${userId}: ${isAdmin}`);
      return isAdmin;
    }
    
    console.log(`User ${userId} not found, admin status: false`);
    return false;
  } catch (error) {
    console.error(`Error checking admin status for user: ${userId}`, error);
    return false;
  }
};

// მიანიჭებს ადმინისტრატორის როლს მომხმარებელს
export const assignAdminRole = async (userId: string): Promise<boolean> => {
  try {
    console.log(`Assigning admin role to user: ${userId}`);
    const userRef = doc(db, 'users', userId);
    // ორივე ადმინ ველი ვანახლოთ, რომ თავსებადი იყოს ორივე მიდგომასთან
    await updateDoc(userRef, {
      'admin': true,
      'isAdmin': true,
      'roles': { admin: true }
    });
    console.log(`Successfully assigned admin role to user: ${userId}`);
    return true;
  } catch (error) {
    console.error(`Error assigning admin role to user: ${userId}`, error);
    return false;
  }
};

// მოხსნის ადმინისტრატორის როლს მომხმარებლისგან
export const removeAdminRole = async (userId: string): Promise<boolean> => {
  try {
    console.log(`Removing admin role from user: ${userId}`);
    const userRef = doc(db, 'users', userId);
    // ორივე ადმინ ველი ვანახლოთ, რომ თავსებადი იყოს ორივე მიდგომასთან
    await updateDoc(userRef, {
      'admin': false,
      'isAdmin': false,
      'roles': { admin: false }
    });
    console.log(`Successfully removed admin role from user: ${userId}`);
    return true;
  } catch (error) {
    console.error(`Error removing admin role from user: ${userId}`, error);
    return false;
  }
};

// მომხმარებლის მოძებნა ელფოსტით
export const findUserByEmail = async (email: string): Promise<{userId: string, userData: UserDocument} | null> => {
  try {
    if (!email) return null;
    
    const normalizedEmail = email.toLowerCase().trim();
    console.log(`Searching for user with email: ${normalizedEmail}`);
    
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("email", "==", normalizedEmail));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      console.log(`No user found with email: ${normalizedEmail}`);
      return null;
    }
    
    const userId = snapshot.docs[0].id;
    const userData = snapshot.docs[0].data() as UserDocument;
    console.log(`Found user with ID: ${userId} for email: ${normalizedEmail}`);
    
    return { userId, userData };
  } catch (error) {
    console.error(`Error finding user by email: ${email}`, error);
    return null;
  }
}; 