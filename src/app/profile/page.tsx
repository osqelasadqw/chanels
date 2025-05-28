'use client';

import { useEffect, useState } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useRouter } from 'next/navigation';
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
  email: string;
  photoURL: string;
  rating: number;
  ratingCount: number;
  registeredDate: Date;
  lastOnline: Date;
  points: number;
  score: number;
  isAdmin: boolean;
}

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [userDataDebug, setUserDataDebug] = useState<any>(null);
  const [productMap, setProductMap] = useState<Record<string, Product>>({});
  const router = useRouter();
  const auth = getAuth();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      if (authUser) {
        try {
          setLoading(true);
          // მომხმარებლის მონაცემების წამოღება
          const userDocRef = doc(db, 'users', authUser.uid);
          const userDocSnap = await getDoc(userDocRef);
          
          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            
            // დებაგისთვის შევინახოთ მთლიანი userData ობიექტი
            console.log('User data from Firebase:', userData);
            setUserDataDebug(userData);
            
            // ქულების მნიშვნელობები ლოგში გამოვიტანოთ
            console.log('Points from Firebase:', userData.points);
            console.log('Score from Firebase:', userData.score);
            
            setUser({
              id: authUser.uid,
              name: userData.name || authUser.displayName || 'User',
              email: authUser.email || '',
              photoURL: authUser.photoURL || userData.photoURL || '/images/default-avatar.png',
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
              where('userId', '==', authUser.uid)
            );
            const productsSnapshot = await getDocs(productsQuery);
            const productsData = productsSnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            })) as Product[];
            
            // დამატებითი ლოგირება პროდუქტის სურათების გასარკვევად
            console.log('Loaded products:', productsData);
            productsData.forEach(product => {
              console.log(`Product ${product.name || product.displayName} image details:`, {
                imageUrl: product.imageUrl,
                imageUrls: product.imageUrls,
                hasImageUrl: !!product.imageUrl,
                hasImageUrls: !!(product.imageUrls && product.imageUrls.length > 0),
                firstImageUrl: product.imageUrls && product.imageUrls.length > 0 ? product.imageUrls[0] : 'none'
              });
            });
            
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
              where('sellerId', '==', authUser.uid)
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
              
              // თუ არ გვაქვს გადახდის ინფორმაცია, მაგრამ გვაქვს პროდუქტის ID
              if (data.productId && !data.paymentAmount && !data.price && productsMap[data.productId]) {
                data.price = String(productsMap[data.productId].price);
              }
              
              // დავაფორმატოთ ფასი
              if (data.paymentAmount) {
                if (typeof data.paymentAmount === 'number') {
                  data.paymentAmount = String(data.paymentAmount);
                }
              }
              
              // თუ არ გვაქვს მყიდველის სახელი, მაგრამ გვაქვს მიმოხილვის ავტორის სახელი
              if (!data.buyerName && data.reviewerName && data.reviewerRole !== 'seller') {
                data.buyerName = data.reviewerName;
              }

              // ჩავატაროთ ზოგადი დებაგინგი თითოეული შეფასებისთვის
              console.log(`Review ${doc.id} details:`, {
                reviewerName: data.reviewerName,
                paymentAmount: data.paymentAmount,
                price: data.price, 
                productName: data.productName,
                channelName: data.channelName,
                reviewerId: data.reviewerId,
                buyerId: data.buyerId,
                sellerName: data.sellerName
              });
              
              return {
              id: doc.id,
                ...data,
                timestamp: data.timestamp?.toDate() || new Date()
              };
            }) as Review[];
            
            // დავლოგოთ შეფასებების მონაცემები დებაგისთვის
            console.log('Reviews from Firebase:', reviewsData);
            
            // დავალაგოთ შეფასებები თარიღის მიხედვით, უახლესი პირველი
            reviewsData.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
            
            setReviews(reviewsData);
          }
        } catch (error) {
          console.error('Error loading profile data:', error);
        } finally {
          setLoading(false);
        }
      } else {
        router.push('/login');
      }
    });
    
    return () => unsubscribe();
  }, [auth, router]);

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
    console.log('Getting platform for review:', review.id);
    
    // პირდაპირ ვამოწმებთ youtube ველს
    if (review.youtube) {
      console.log('Review has YouTube field:', review.youtube);
      return 'YouTube';
    }
    
    // მანუალურად ვადგენთ პლატფორმას სხვადასხვა ტიპის მიხედვით
    if (review.channelName) {
      // თუ არხის სახელში არის "youtube" ან მსგავსი ტექსტი
      const channelNameLower = review.channelName.toLowerCase();
      if (channelNameLower.includes('youtube') || 
          channelNameLower.includes('yt') || 
          channelNameLower.includes('tube')) {
        return 'YouTube';
      }
      
      // Facebook, Instagram და სხვა პლატფორმები
      if (channelNameLower.includes('facebook') || channelNameLower.includes('fb')) return 'Facebook';
      if (channelNameLower.includes('instagram') || channelNameLower.includes('insta')) return 'Instagram';
      if (channelNameLower.includes('tiktok') || channelNameLower.includes('tt')) return 'TikTok';
      if (channelNameLower.includes('twitter') || channelNameLower.includes('x.com')) return 'Twitter';
    }
    
    // პროდუქტის პლატფორმის მიხედვით
    if (review.productId && productMap[review.productId]) {
      const product = productMap[review.productId];
      console.log('Product found:', product.id, 'Platform:', product.platform, 'Category:', product.category);
      
      // შევამოწმოთ პლატფორმა პირდაპირ
      if (product.platform) {
        const platform = product.platform.toLowerCase();
        if (platform.includes('youtube')) return 'YouTube';
        if (platform.includes('twitter') || platform.includes('x')) return 'Twitter';
        if (platform.includes('facebook') || platform.includes('fb')) return 'Facebook';
        if (platform.includes('tiktok') || platform.includes('tt')) return 'TikTok';
        if (platform.includes('instagram') || platform.includes('insta')) return 'Instagram';
        return capitalizeFirstLetter(product.platform); // დავაბრუნოთ კაპიტალიზებული პლატფორმის სახელი
      }
      
      // თუ არის youtube ველი პროდუქტში
      if (product.youtube) return 'YouTube';
      
      // მოვძებნოთ კატეგორიაში
      if (product.category) {
        const category = product.category.toLowerCase();
        if (category.includes('youtube')) return 'YouTube';
        if (category.includes('twitter') || category.includes('x')) return 'Twitter';
        if (category.includes('facebook') || category.includes('fb')) return 'Facebook';
        if (category.includes('tiktok') || category.includes('tt')) return 'TikTok';
        if (category.includes('instagram') || category.includes('insta')) return 'Instagram';
      }
    }
    
    // თუ გვაქვს პროდუქტის სახელი და ის შეიცავს პლატფორმის მინიშნებას
    if (review.productName) {
      const productNameLower = review.productName.toLowerCase();
      if (productNameLower.includes('youtube') || productNameLower.includes('yt')) return 'YouTube';
      if (productNameLower.includes('twitter') || productNameLower.includes('x.com')) return 'Twitter';
      if (productNameLower.includes('facebook') || productNameLower.includes('fb')) return 'Facebook';
      if (productNameLower.includes('tiktok')) return 'TikTok';
      if (productNameLower.includes('instagram') || productNameLower.includes('insta')) return 'Instagram';
    }
    
    // თუ ვერაფერი ვიპოვეთ, დავაბრუნოთ ფიქსირებული მნიშვნელობა "YouTube", რადგან
    // უმეტესობა არხები არის იუთუბი
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

  // პროდუქტის სტატუსის ფერის განსაზღვრა
  const getStatusColor = (status: string) => {
    if (!status) return 'bg-gray-500';
    
    const statusLower = status.toLowerCase();
    if (statusLower.includes('active') || statusLower === 'verified' || statusLower === 'approved') {
      return 'bg-green-600';
    } else if (statusLower.includes('pending') || statusLower === 'review') {
      return 'bg-yellow-600';
    } else if (statusLower.includes('sold') || statusLower.includes('purchased')) {
      return 'bg-blue-600';
    } else if (statusLower.includes('rejected') || statusLower.includes('blocked') || statusLower === 'suspended') {
      return 'bg-red-600';
    } else {
      return 'bg-gray-500'; // Default color
    }
  };

  // პროდუქტის სტატუსის აიკონის განსაზღვრა
  const getStatusIcon = (status: string) => {
    if (!status) {
      return <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />;
    }
    
    const statusLower = status.toLowerCase();
    if (statusLower.includes('active') || statusLower === 'verified' || statusLower === 'approved') {
      return <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />;
    } else if (statusLower.includes('pending') || statusLower === 'review') {
      return <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd" />;
    } else if (statusLower.includes('sold') || statusLower.includes('purchased')) {
      return <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />;
    } else {
      return <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />;
    }
  };
  
  // პროდუქტის პლატფორმის განსაზღვრა
  const getProductPlatform = (product: Product) => {
    if (!product) return '';
    
    if (product.youtube) return 'YouTube';
    
    if (product.platform) {
      const platform = product.platform.toLowerCase();
      if (platform.includes('youtube')) return 'YouTube';
      if (platform.includes('twitter') || platform.includes('x')) return 'Twitter';
      if (platform.includes('facebook') || platform.includes('fb')) return 'Facebook';
      if (platform.includes('tiktok')) return 'TikTok';
      if (platform.includes('instagram') || platform.includes('insta')) return 'Instagram';
      return capitalizeFirstLetter(product.platform);
    }
    
    return product.category || '';
  };

  // ფორმატირების ახალი ფუნქციები
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
  
  // სტატუსის ფორმატირება
  const formatStatus = (status: string) => {
    if (!status) return '';
    
    const statusLower = status.toLowerCase();
    if (statusLower.includes('active')) return 'აქტიური';
    if (statusLower.includes('pending')) return 'მოლოდინში';
    if (statusLower.includes('review')) return 'განხილვაში';
    if (statusLower.includes('sold')) return 'გაყიდული';
    if (statusLower.includes('purchased')) return 'ნაყიდი';
    if (statusLower.includes('reject')) return 'უარყოფილი';
    if (statusLower.includes('block') || statusLower.includes('suspend')) return 'დაბლოკილი';
    
    // პირველი ასო დიდი ასოთი
    return capitalizeFirstLetter(status);
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

  return (
    <div className="min-h-screen w-full">
      <div className="w-full">
        {user && (
          <div className="w-full overflow-hidden">
            {/* პროფილის ზედა ნაწილი */}
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="relative w-10 h-10 rounded-full overflow-hidden mr-4">
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
                          ადმინი
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">Last online: {formatDate(user.lastOnline)}</p>
                  </div>
                </div>

                {/* არხების სათაური შუაში */}
                <div className="text-center">
                  <p className="text-gray-500 text-sm">
                    Last online {user?.lastOnline ? `${Math.floor((new Date().getTime() - user.lastOnline.getTime()) / 60000)} minutes ago` : ''}
                  </p>
                  <h2 className="text-2xl font-bold text-gray-800">
                  My Listings ({products.length}):
                  </h2>
                  <p className="text-gray-600 mt-1">
                    Rating: {userDataDebug?.points || 0}
                  </p>
                  <p className="text-gray-500 text-sm mt-1">
                    Registered {user?.registeredDate ? `${Math.floor((new Date().getTime() - user.registeredDate.getTime()) / (1000 * 3600 * 24 * 365))} years ago` : ''}
                  </p>
                </div>
                    
                {/* ქულების ბლოკები */}
                <div className="flex space-x-4">
                  {/* ტრანზაქციის ქულების ბლოკი */}
                  <div className="bg-green-50 px-6 py-3 rounded-lg">
                    <div className="text-center">
                      <span className="text-green-600 font-bold text-2xl">{userDataDebug?.points || 0}</span>
                      <p className="text-green-700 font-medium">Transaction Points</p>
                    </div>
                  </div>
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
                      არხები არ არის
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
                          {formatDate(review.timestamp)} {new Date(review.timestamp).toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', second: '2-digit'})}
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
                              {/* ვინ გადაიხადა - მყიდველის სახელი, არხის სახელი და პროდუქტის ფასი */}
                              <div className="flex items-center flex-wrap">
                                <span className="font-medium text-gray-900">
                                  {review.buyerId === user?.id ? 
                                    "ჩემთვის გადაიხადა" : 
                                    `${review.buyerName || review.reviewerName || "მყიდველი"}${review.channelName ? 
                                      ` | ` : 
                                      ''}`}
                                </span>
                                {/* პლატფორმის ბეჯი */}
                                {review.channelName && (
                                  <span className={`mx-1 px-2 py-0.5 rounded-md text-xs font-medium ${getPlatformColor(getPlatformLabel(review, productMap))}`}>
                                    {getPlatformLabel(review, productMap)}
                                  </span>
                                )}
                                {/* არხის სახელი */}
                                {review.channelName && (
                                  <span className="font-medium text-gray-900">
                                    {review.channelName}
                                  </span>
                                )}
                                {/* პროდუქტის ფასი მომხმარებლის და არხის სახელის გვერდით */}
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
                            
                            {/* პროდუქტის სახელის ჩვენება, თუ არის და განსხვავდება არხის სახელისგან */}
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
                            
                            {/* შეფასების ვარსკვლავები */}
                            <div className="mt-1 flex items-center">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <svg 
                                  key={star}
                                  xmlns="http://www.w3.org/2000/svg" 
                                  viewBox="0 0 24 24" 
                                  fill={star <= (review.rating || 0) ? "currentColor" : "none"}
                                  stroke={star <= (review.rating || 0) ? "currentColor" : "currentColor"}
                                  className={`w-3 h-3 ${star <= (review.rating || 0) ? "text-yellow-400" : "text-gray-300"}`}
                                >
                                  <path 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round" 
                                    strokeWidth="2" 
                                    d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                                  />
                                </svg>
                              ))}
                            </div>
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