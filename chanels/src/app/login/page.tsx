"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import LoginButton from "@/components/auth/LoginButton";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  
  // თუ მომხმარებელი უკვე ავტორიზებულია, გადავამისამართოთ მთავარ გვერდზე
  useEffect(() => {
    if (user && !loading) {
      router.push("/");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        <p className="mt-4 text-gray-600">იტვირთება...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <div className="p-8 bg-white shadow-md rounded-md text-center">
        <h1 className="text-2xl font-bold mb-6">შესვლა</h1>
        <p className="mb-8 text-gray-600">გთხოვთ შეხვიდეთ თქვენს ანგარიშზე</p>
        <LoginButton />
      </div>
    </div>
  );
} 