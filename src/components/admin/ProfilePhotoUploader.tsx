"use client";

import { useState, useRef } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, updateDoc } from "firebase/firestore";
import { db, storage } from "@/firebase/config";
import Image from "next/image";

export default function ProfilePhotoUploader() {
  const { user, refreshUserData } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    // შევამოწმოთ არის თუ არა ფაილი სურათი
    if (!file.type.startsWith('image/')) {
      setError('გთხოვთ აირჩიოთ სურათის ფაილი');
      return;
    }
    
    // ფაილის ზომის შემოწმება (მაქს. 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('სურათი არ უნდა აღემატებოდეს 5MB-ს');
      return;
    }
    
    // პირდაპირ დავიწყოთ ატვირთვა ფაილის არჩევისას
    await handleUpload(file);
  };

  const handleUpload = async (file: File) => {
    if (!user) return;
    
    try {
      setUploading(true);
      setError(null);
      setSuccess(false);
      
      // ფაილის ატვირთვა Firebase Storage-ში
      const fileExtension = file.name.split('.').pop();
      const emailFileName = user.email ? `${user.email.replace(/[.@]/g, '_')}` : user.id;
      const storageRef = ref(storage, `admin-photos/${emailFileName}.${fileExtension}`);
      const uploadResult = await uploadBytes(storageRef, file);
      
      // მივიღოთ ატვირთული ფაილის URL
      const downloadURL = await getDownloadURL(uploadResult.ref);
      
      // განვაახლოთ მომხმარებლის დოკუმენტი Firestore-ში
      const userDocRef = doc(db, "users", user.id);
      await updateDoc(userDocRef, {
        photoURL: downloadURL,
        updatedAt: new Date().getTime(),
        // დავამატოთ ცალკე ველი ადმინის ფოტოსთვის, რომ უფრო მარტივად მოვძებნოთ
        adminPhotoURL: downloadURL
      });
      
      // განაახლეთ ადგილობრივი მომხმარებლის მონაცემები
      if (refreshUserData) {
        await refreshUserData();
      }
      
      setSuccess(true);
      // წარმატების შემთხვევაში გამოვაჩინოთ შეტყობინება 3 წამით
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error("Error uploading photo:", err);
      setError('სურათის ატვირთვა ვერ მოხერხდა');
      // შეცდომის შემთხვევაში გამოვაჩინოთ შეტყობინება 3 წამით
      setTimeout(() => setError(null), 3000);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
        className="hidden"
      />
        
        <button
        onClick={handleFileSelect}
          disabled={uploading}
        className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-purple-500 transition-colors duration-150"
        >
          {uploading ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ატვირთვა...
            </span>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-2a6 6 0 100-12 6 6 0 000 12z" clipRule="evenodd" />
              <path d="M10 8a2 2 0 100-4 2 2 0 000 4z" />
              <path fillRule="evenodd" d="M10 4a4 4 0 100 8 4 4 0 000-8z" clipRule="evenodd" />
            </svg>
            პროფილის ფოტო
          </>
        )}
        </button>
      
      {error && (
        <div className="fixed top-4 right-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm z-50 shadow-lg">
          {error}
      </div>
      )}
      
      {success && (
        <div className="fixed top-4 right-4 p-3 bg-green-50 border border-green-200 rounded-md text-green-700 text-sm z-50 shadow-lg">
          პროფილის ფოტო წარმატებით განახლდა!
    </div>
      )}
    </>
  );
} 