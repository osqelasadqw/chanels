"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import ProductForm from "@/components/forms/ProductForm";

export default function NewProductPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push("/");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect due to the useEffect
  }

  return (
    <div className="bg-gradient-to-br from-blue-100 via-blue-200 to-cyan-100 min-h-screen p-4 sm:p-6 md:p-8 flex items-center justify-center">
      <div className="w-full">
        <ProductForm />
      </div>
    </div>
  );
} 