'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

interface Review {
  id: string;
  reviewerId: string;
  reviewerName: string;
  productId: string;
  productName?: string;
  rating: number;
  comment: string;
  timestamp: Date;
  reviewerPhotoURL?: string;
  youtube?: string;
  channelName?: string;
  price?: string | number;
  sellerId?: string;
  sellerName?: string;
  sentiment?: 'positive' | 'negative';
  paymentAmount?: string | number;
  buyerId?: string;
  buyerName?: string;
  reviewerRole?: 'buyer' | 'seller';
  transactionComplete?: boolean;
  transactionDate?: number;
}

interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
  platform: string;
  imageUrl: string;
  imageUrls?: string[];
  userId: string;
  status: string;
  subscriberCount?: number;
  subscribers?: number;
  income?: number;
  monetization?: boolean;
  category?: string;
  youtube?: string;
  channelName?: string;
  displayName?: string;
}

interface User {
  id: string;
  name: string;
  email?: string; // არ ვაჩვენებთ საჯაროდ
  photoURL: string;
  rating: number;
  ratingCount: number;
  registeredDate: Date;
  lastOnline: Date;
  points: number;
  score: number;
  isAdmin: boolean;
}

export default function PublicProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [productMap, setProductMap] = useState<Record<string, Product>>({});
  
  // მოვიპოვოთ მომხმარებლის ID URL-დან
  const pathname = usePathname();
  const userId = pathname ? pathname.split('/').pop() || '' : '';

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!userId) {
        setError("User ID not found");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        // მომხმარებლის მონაცემების წამოღება
        const userDocRef = doc(db, 'users', userId);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          
          // დებაგისთვის შევინახოთ მთლიანი userData ობიექტი
          console.log('User data from Firebase:', userData);
          
          setUser({
            id: userId,
            name: userData.name || userData.displayName || 'User',
            photoURL: userData.photoURL || '/images/default-avatar.png',
            rating: userData.rating || 0,
            ratingCount: userData.ratingCount || 0,
            registeredDate: userData.createdAt?.toDate() || new Date(),
            lastOnline: userData.lastLogin?.toDate() || userData.lastOnline?.toDate() || new Date(),
            points: Number(userData.points) || 0,
            score: Number(userData.score) || 0,
            isAdmin: Boolean(userData.isAdmin) || Boolean(userData.roles?.admin) || false,
          });
          
          // პროდუქტების წამოღება
          const productsQuery = query(
            collection(db, 'products'),
            where('userId', '==', userId)
          );
          const productsSnapshot = await getDocs(productsQuery);
          const productsData = productsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Product[];
          
          // დამატებითი ლოგირება პროდუქტის სურათების გასარკვევად
          console.log('Loaded products:', productsData);
          
          setProducts(productsData);
          
          // შევქმნათ პროდუქტების მეპი გასაადვილებლად
          const productsMap: Record<string, Product> = {};
          productsData.forEach(product => {
            productsMap[product.id] = product;
          });
          setProductMap(productsMap);
          
          // შეფასებების წამოღება
          const reviewsQuery = query(
            collection(db, 'reviews'),
            where('sellerId', '==', userId)
          );
          const reviewsSnapshot = await getDocs(reviewsQuery);
          const reviewsData = reviewsSnapshot.docs.map(doc => {
            const data = doc.data();
            // თუ არ გვაქვს productName, შევეცადოთ მისი მიღება productMap-იდან
            if (data.productId && !data.productName && productsMap[data.productId]) {
              data.productName = productsMap[data.productId].name;
            }
            // თუ არ გვაქვს channelName, შევეცადოთ მისი მიღება productMap-იდან
            if (data.productId && !data.channelName && productsMap[data.productId] && productsMap[data.productId].channelName) {
              data.channelName = productsMap[data.productId].channelName;
            }
            
            return {
              id: doc.id,
              ...data,
              timestamp: data.timestamp?.toDate() || new Date()
            };
          }) as Review[];
          
          // დავალაგოთ შეფასებები თარიღის მიხედვით, უახლესი პირველი
          reviewsData.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
          
          setReviews(reviewsData);
        } else {
          setError("User not found");
        }
      } catch (error) {
        console.error('Error loading profile data:', error);
        setError("Error loading profile data");
      } finally {
        setLoading(false);
      }
    };
    
    fetchUserProfile();
  }, [userId]);

  // თარიღის ფორმატირება
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  // რეიტინგის გენერირება
  const renderRating = (rating: number) => {
    return (
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((star) => (
          <svg 
            key={star}
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 24 24" 
            fill={star <= rating ? "currentColor" : "none"}
            stroke={star <= rating ? "currentColor" : "currentColor"}
            className={`w-5 h-5 ${star <= rating ? "text-yellow-400" : "text-gray-300"}`}
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth="2" 
              d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
            />
          </svg>
        ))}
        <span className="ml-2 text-gray-700">{rating.toFixed(1)}</span>
      </div>
    );
  };

  // პლატფორმის ტიპის განსაზღვრა
  const getPlatformLabel = (review: Review, productMap: Record<string, Product>) => {
    if (review.youtube) return 'YouTube';
    
    if (review.channelName) {
      const channelNameLower = review.channelName.toLowerCase();
      if (channelNameLower.includes('youtube') || channelNameLower.includes('yt')) return 'YouTube';
      if (channelNameLower.includes('facebook') || channelNameLower.includes('fb')) return 'Facebook';
      if (channelNameLower.includes('instagram') || channelNameLower.includes('insta')) return 'Instagram';
      if (channelNameLower.includes('tiktok')) return 'TikTok';
      if (channelNameLower.includes('twitter') || channelNameLower.includes('x.com')) return 'Twitter';
    }
    
    if (review.productId && productMap[review.productId]) {
      const product = productMap[review.productId];
      
      if (product.platform) {
        const platform = product.platform.toLowerCase();
        if (platform.includes('youtube')) return 'YouTube';
        if (platform.includes('twitter') || platform.includes('x')) return 'Twitter';
        if (platform.includes('facebook') || platform.includes('fb')) return 'Facebook';
        if (platform.includes('tiktok')) return 'TikTok';
        if (platform.includes('instagram') || platform.includes('insta')) return 'Instagram';
        return capitalizeFirstLetter(product.platform);
      }
      
      if (product.youtube) return 'YouTube';
      
      if (product.category) {
        const category = product.category.toLowerCase();
        if (category.includes('youtube')) return 'YouTube';
        if (category.includes('twitter') || category.includes('x')) return 'Twitter';
        if (category.includes('facebook') || category.includes('fb')) return 'Facebook';
        if (category.includes('tiktok')) return 'TikTok';
        if (category.includes('instagram') || category.includes('insta')) return 'Instagram';
      }
    }
    
    return 'YouTube';
  };

  // დამხმარე ფუნქცია სტრინგის პირველი ასოს დასაკაპიტალიზებლად
  const capitalizeFirstLetter = (string: string) => {
    if (!string) return '';
    return string.charAt(0).toUpperCase() + string.slice(1);
  };

  // პლატფორმის ფერის კლასი
  const getPlatformColor = (platform: string) => {
    switch(platform) {
      case 'YouTube':
        return 'bg-red-100 text-red-800';
      case 'Twitter':
        return 'bg-blue-100 text-blue-800';
      case 'Facebook':
        return 'bg-indigo-100 text-indigo-800';
      case 'TikTok':
        return 'bg-gray-100 text-gray-800';
      case 'Instagram':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-green-100 text-green-800';
    }
  };

  // რიცხვის ფორმატირება (1000 -> 1k)
  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    } else {
      return num.toString();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen w-full">
        <div className="w-full">
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen w-full">
        <div className="w-full">
          <div className="p-6">
            <h2 className="text-xl font-bold text-red-600 mb-4">Error</h2>
            <p className="text-gray-700">{error}</p>
            <div className="mt-6">
              <Link href="/" className="text-indigo-600 hover:text-indigo-800 font-medium">
                &larr; Back to Homepage
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full">
      <div className="w-full">
        {user && (
          <div className="w-full overflow-hidden">
            {/* პროფილის ზედა ნაწილი */}
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="relative w-16 h-16 rounded-full overflow-hidden mr-4">
                    <Image 
                      src={user.photoURL} 
                      alt={user.name} 
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div>
                    <div className="flex items-center">
                      <h1 className="text-2xl font-bold text-gray-800">{user.name}</h1>
                      {user.isAdmin && (
                        <span className="ml-2 px-2 py-0.5 rounded-md text-xs font-medium bg-blue-100 text-blue-800">
                          Admin
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">Last seen: {formatDate(user.lastOnline)}</p>
                  </div>
                </div>

                {/* არხების სათაური შუაში */}
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-gray-800">
                    Channels ({products.length})
                  </h2>
                  <div className="flex items-center justify-center mt-1">
                    <span className="text-gray-600 mr-2">Rating:</span>
                    <span className="text-green-600 font-bold">{user.points || 0}</span>
                    <span className="ml-2 text-gray-600">Transaction Points</span>
                  </div>
                  <p className="text-gray-500 text-sm mt-1">
                    Registered {user?.registeredDate ? `${Math.floor((new Date().getTime() - user.registeredDate.getTime()) / (1000 * 3600 * 24 * 30))} months ago` : ''}
                  </p>
                </div>
              </div>
            </div>

            <div className="md:flex">
              {/* პროდუქტების/არხების სექცია */}
              <div className="md:w-full p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 w-full">
                  {products.length > 0 ? (
                    products.map((product) => (
                      <div className="flex flex-col p-2" key={product.id}>
                        <div className="flex items-center">
                          {/* არხის სურათი */}
                          <div className="w-16 h-16 relative flex-shrink-0">
                            {product.imageUrls && product.imageUrls.length > 0 ? (
                              <Image 
                                src={product.imageUrls[0]}
                                alt={product.displayName || product.name || ''}
                                width={64}
                                height={64}
                                className="rounded-md"
                                priority
                                unoptimized
                              />
                            ) : product.imageUrl ? (
                              <Image 
                                src={product.imageUrl}
                                alt={product.displayName || product.name || ''} 
                                width={64}
                                height={64}
                                className="rounded-md"
                                priority
                                unoptimized
                              />
                            ) : (
                              <div className="w-16 h-16 bg-gray-200 rounded-md flex items-center justify-center">
                                <span className="text-xl font-bold text-gray-500">
                                  {(product.displayName || product.name || 'A').charAt(0)}
                                </span>
                              </div>
                            )}
                          </div>
                          
                          {/* არხის სახელი, გამომწერები და View ღილაკი */}
                          <div className="ml-4">
                            {/* არხის სახელი */}
                            <h3 className="text-base font-medium text-gray-900 truncate">
                              {product.displayName || product.channelName || product.name}
                            </h3>
                            
                            {/* გამომწერები */}
                            <div className="flex items-center text-sm text-gray-500 mt-1">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                              <span className="mr-1">{formatNumber(product.subscribers || product.subscriberCount || 0)}</span>
                            </div>
                            
                            {/* View Details ღილაკი */}
                            <Link href={`/products/${product.id}`}>
                              <span className="inline-block mt-2 px-4 py-1.5 text-sm text-gray-800 bg-gray-100 rounded-full hover:bg-gray-200">
                                View Details
                              </span>
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-full text-center py-8 text-gray-500">
                      This user has no published channels
                    </div>
                  )}
                </div>
              </div>
              
              {/* შეფასებების სექცია */}
              <div className="md:w-1/3 p-6 bg-opacity-50 backdrop-blur-sm">
                <h2 className="text-xl font-bold text-gray-800 mb-6">Reviews ({reviews.length}):</h2>
                  
                <div className="space-y-6">
                  {reviews.length > 0 ? (
                    reviews.map((review) => (
                      <div key={review.id} className="pb-4 last:pb-0">
                        <div className="text-gray-500 text-xs mb-1">
                          {formatDate(review.timestamp)} {new Date(review.timestamp).toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'})}
                        </div>
                        <div className="flex items-start">
                          <div className={`${review.sentiment === 'positive' ? "text-green-500" : "text-red-500"} mr-2 mt-1`}>
                            {review.sentiment === 'positive' ? (
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-1 mb-1">
                              <div className="flex items-center flex-wrap">
                                <span className="font-medium text-gray-900">
                                  {review.buyerName || review.reviewerName || "Buyer"}
                                  {review.channelName ? ` | ` : ''}
                                </span>
                                {/* პლატფორმის ბეჯი */}
                                {review.channelName && (
                                  <span className={`mx-1 px-2 py-0.5 rounded-md text-xs font-medium shadow-sm ${getPlatformColor(getPlatformLabel(review, productMap))}`}>
                                    {getPlatformLabel(review, productMap)}
                                  </span>
                                )}
                                {/* არხის სახელი */}
                                {review.channelName && (
                                  <span className="font-medium text-gray-900">
                                    {review.channelName}
                                  </span>
                                )}
                                {/* პროდუქტის ფასი */}
                                {(review.paymentAmount || review.price) && (
                                  <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs font-medium flex items-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {typeof (review.paymentAmount || review.price) === 'number' 
                                      ? Number(review.paymentAmount || review.price).toFixed(2) 
                                      : review.paymentAmount || review.price}$
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            {/* პროდუქტის სახელის ჩვენება, თუ არის */}
                            {review.productName && review.productName !== review.channelName && (
                              <div className="text-gray-600 text-sm flex items-center mt-1">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
                                </svg>
                                {review.productName}
                              </div>
                            )}
                            
                            {/* კომენტარი */}
                            <p className="text-gray-700 mt-1">{review.comment}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      No reviews yet
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        

      </div>
    </div>
  );
} 