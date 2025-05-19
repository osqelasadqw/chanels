"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { collection, query, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/firebase/config";
import { Product } from "@/types/product";
import { useAuth } from "@/components/auth/AuthProvider";
import ProductCard from "@/components/products/ProductCard"; // Assuming ProductCard is exportable
import { useRouter } from "next/navigation";

// Skeleton Component (copied from main page.tsx for now, ideally should be a shared component)
const ProductCardSkeleton = () => (
  <div className="bg-white rounded-lg shadow-md overflow-hidden transition-transform hover:shadow-lg w-full animate-pulse">
    <div className="relative aspect-video bg-gray-300"></div>
    <div className="p-4">
      <div className="flex justify-between items-center mb-2">
        <div className="px-2 py-1 bg-gray-200 rounded w-20 h-6"></div>
        <div className="w-24 h-4 bg-gray-200 rounded"></div>
      </div>
      <div className="h-7 bg-gray-200 rounded w-3/4 mb-2"></div>
      <div className="flex justify-between items-center mb-3">
        <div className="h-7 w-16 bg-gray-200 rounded"></div>
        <div className="h-4 w-28 bg-gray-200 rounded"></div>
      </div>
      <div className="flex justify-between gap-2">
        <div className="flex-1 h-10 bg-gray-200 rounded"></div>
        <div className="flex-1 h-10 bg-gray-200 rounded"></div>
      </div>
    </div>
  </div>
);

export default function MyFavoritesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [favoriteProducts, setFavoriteProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) {
      setIsLoading(true);
      return;
    }

    if (!user) {
      // Redirect to login or show a message if user is not authenticated
      // For now, let's show a message and a button to login
      setIsLoading(false);
      return;
    }

    const fetchFavoriteProducts = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const favoritesCollectionRef = collection(db, "users", user.id, "favorites");
        const favoritesSnapshot = await getDocs(favoritesCollectionRef);
        
        if (favoritesSnapshot.empty) {
          setFavoriteProducts([]);
          setIsLoading(false);
          return;
        }

        const productPromises = favoritesSnapshot.docs.map(async (favDoc) => {
          const productId = favDoc.data().productId as string;
          if (productId) {
            const productDocRef = doc(db, "products", productId);
            const productDoc = await getDoc(productDocRef);
            if (productDoc.exists()) {
              return { id: productDoc.id, ...productDoc.data() } as Product;
            }
          }
          return null; // Return null if product not found or productId is missing
        });

        const fetchedProducts = (await Promise.all(productPromises)).filter(p => p !== null) as Product[];
        setFavoriteProducts(fetchedProducts);
      } catch (err) {
        console.error("Error fetching favorite products:", err);
        setError("Failed to load favorite products.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchFavoriteProducts();
  }, [user, authLoading]);

  // Placeholder for onContactSeller, can be expanded later
  const handleContactSellerPlaceholder = async (productId: string, paymentMethod: string, useEscrow: boolean) => {
    alert(`Contacting seller for product: ${productId} (Placeholder). Payment: ${paymentMethod}, Escrow: ${useEscrow}`);
    // Potentially redirect to the product page or a chat interface
    // router.push(`/products/${productId}`);
  };
  
  if (authLoading || (isLoading && !error && !favoriteProducts.length)) { // Initial loading including auth
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8 text-center text-gray-800">My Favorites</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, index) => (
             <div key={`skeleton-${index}`} className="h-[450px] flex">
                <ProductCardSkeleton />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!user && !authLoading) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-3xl font-bold mb-4 text-gray-800">My Favorites</h1>
        <p className="text-xl text-gray-600 mb-6">Please log in to see your favorite channels.</p>
        <Link href="/login" className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors font-medium">
          Login
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-3xl font-bold mb-4 text-gray-800">My Favorites</h1>
        <p className="text-xl text-red-600">{error}</p>
      </div>
    );
  }

  if (favoriteProducts.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-3xl font-bold mb-8 text-gray-800">My Favorites</h1>
        <p className="text-xl text-gray-600 mb-6">You haven\'t added any channels to your favorites yet.</p>
        <Link href="/" className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors font-medium">
          Browse Channels
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-200 py-8">
      <div className="container mx-auto px-4">
        <h1 className="text-4xl font-bold mb-10 text-center text-gray-800 tracking-tight">My Favorite Channels</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {favoriteProducts.map((product) => (
            <div key={product.id} className="h-[450px] flex"> {/* Ensure consistent height */}
              <ProductCard 
                product={product} 
                onContactSeller={handleContactSellerPlaceholder} 
                className="w-full"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
} 