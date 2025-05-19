"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { db } from "@/firebase/config";
import { collection, query, where, getDocs, orderBy, deleteDoc, doc } from "firebase/firestore";
import { Product } from "@/types/product";

export default function MyProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { user } = useAuth();
  const router = useRouter();
  const [indexUrl, setIndexUrl] = useState<string | null>(null);

  // Fetch user's products
  useEffect(() => {
    const fetchProducts = async () => {
      if (!user) return;

      try {
        setLoading(true);
        setError(null);

        const q = query(
          collection(db, "products"),
          where("userId", "==", user.id),
          orderBy("createdAt", "desc")
        );

        try {
          const querySnapshot = await getDocs(q);
          const productsList = querySnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data()
          })) as Product[];

          setProducts(productsList);
        } catch (err: any) {
          if (err.message?.includes("requires an index")) {
            console.error("Index error:", err);
            // Extract index URL from the error message
            const indexUrlMatch = err.message.match(/https:\/\/console\.firebase\.google\.com[^\s\"\')]+/);
            const indexUrl = indexUrlMatch ? indexUrlMatch[0] : null;
            
            setError(
              `Indexing required. ${indexUrl ? 'Click the link below to create the index.' : 'Please follow the link in the browser console error message.'}`
            );
            
            // Store the link in state
            if (indexUrl) {
              setIndexUrl(indexUrl);
            }
          } else {
            throw err; // Re-throw other types of errors
          }
        }
      } catch (err) {
        console.error("Error fetching products:", err);
        setError("Failed to load your listings");
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchProducts();
    }
  }, [user]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push("/");
    }
  }, [user, loading, router]);

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm("Are you sure you want to delete this listing? This action cannot be undone.")) {
      return;
    }

    try {
      setDeletingId(productId);
      await deleteDoc(doc(db, "products", productId));
      
      // Update the products list
      setProducts(products.filter(product => product.id !== productId));
    } catch (err) {
      console.error("Error deleting product:", err);
      alert("Failed to delete listing. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

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

  if (error) {
    return (
      <div className="bg-red-100 text-red-700 p-6 rounded-lg">
        <h2 className="text-xl font-bold mb-2">Error</h2>
        <p className="mb-4">{error}</p>
        {error.includes("Indexing required") && (
          <div className="mt-4 bg-yellow-50 p-4 border border-yellow-200 rounded-md">
            <h3 className="text-lg font-semibold text-yellow-700 mb-2">Please follow these instructions:</h3>
            
            {indexUrl ? (
              <div className="mb-6">
                <a 
                  href={indexUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="inline-block bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
                >
                  Click here to create the index
                </a>
              </div>
            ) : null}
            
            <ol className="list-decimal pl-5 text-yellow-800 space-y-2">
              {!indexUrl && (
                <li>Open the browser console (F12 or right-click and "Inspect" → "Console")</li>
              )}
              {!indexUrl && (
                <li>Find the error message containing the link</li>
              )}
              {!indexUrl && (
                <li>Click the link, it will open the Firebase console</li>
              )}
              <li>Click the "Create index" button in the Firebase console</li>
              <li>Wait for the index to be created (2-3 minutes)</li>
              <li>Refresh this page <button onClick={() => window.location.reload()} className="text-blue-600 underline">Reload</button></li>
            </ol>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-gradient-to-r from-indigo-600 to-blue-500 rounded-xl shadow-xl p-6 mb-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">My Channels</h1>
            <p className="text-indigo-100">Manage your social media channels in one place</p>
          </div>
          <Link 
            href="/products/new" 
            className="mt-4 md:mt-0 px-6 py-3 bg-white text-indigo-600 rounded-md hover:bg-indigo-50 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-1 font-medium flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create New Channel
          </Link>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl shadow-lg border border-gray-100">
          <div className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 text-indigo-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-2xl font-bold mb-3 text-gray-800">No Channels Yet</h3>
          <p className="text-gray-500 mb-8 max-w-md mx-auto">You haven't listed any channels for sale. Create your first listing to start selling your social media channel.</p>
          <Link 
            href="/products/new" 
            className="px-8 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-1 font-medium inline-flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create Your First Channel
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100">
          <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
              <div className="mb-4 sm:mb-0">
                <h2 className="text-xl font-bold text-gray-800">Your Channel Listings</h2>
                <p className="text-gray-500 text-sm">Total: {products.length} channel{products.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="flex items-center text-sm text-gray-500">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 mr-1 text-indigo-500">
                  <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75V6z" clipRule="evenodd" />
                </svg>
                <span>Click on a channel name to view details</span>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Channel Info
                  </th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Platform & Stats
                  </th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Price
                  </th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {products.map((product) => (
                  <tr key={product.id} className="hover:bg-indigo-50/30 transition-colors duration-150">
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-12 w-12 flex-shrink-0 mr-4 relative rounded-lg overflow-hidden shadow-sm">
                          {product.imageUrls && product.imageUrls.length > 0 ? (
                            <Image 
                              src={product.imageUrls[0]} 
                              alt={product.displayName}
                              width={48}
                              height={48}
                              className="h-12 w-12 object-cover"
                            />
                          ) : (
                            <div className="h-12 w-12 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-gray-400">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                              </svg>
                            </div>
                          )}
                          {product.monetization && (
                            <div className="absolute top-0 right-0 h-4 w-4 bg-green-500 rounded-full border-2 border-white" title="Monetization enabled"></div>
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900 mb-1">
                            <Link href={`/products/${product.id}`} className="hover:text-indigo-600 transition-colors">
                              {product.displayName}
                            </Link>
                          </div>
                          <div className="text-xs text-gray-500 flex items-center">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 mr-1">
                              <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75V6z" clipRule="evenodd" />
                            </svg>
                            Added {new Date(product.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="mb-2">
                        <span className={`px-3 py-1.5 inline-flex text-xs leading-4 font-semibold rounded-full 
                          ${product.platform === 'YouTube' ? 'bg-red-100 text-red-800' : 
                          product.platform === 'TikTok' ? 'bg-black text-white' : 
                          product.platform === 'Instagram' ? 'bg-purple-100 text-purple-800' : 
                          product.platform === 'Twitter' ? 'bg-blue-100 text-blue-800' : 
                          product.platform === 'Facebook' ? 'bg-blue-100 text-blue-800' : 
                          product.platform === 'Telegram' ? 'bg-blue-100 text-blue-800' : 
                          'bg-gray-100 text-gray-800'}`}>
                          {product.platform}
                        </span>
                      </div>
                      <div className="flex items-center text-sm text-gray-600">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 mr-1 text-gray-400">
                          <path d="M4.5 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM14.25 8.625a3.375 3.375 0 116.75 0 3.375 3.375 0 01-6.75 0zM1.5 19.125a7.125 7.125 0 0114.25 0v.003l-.001.119a.75.75 0 01-.363.63 13.067 13.067 0 01-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 01-.364-.63l-.001-.122zM17.25 19.128l-.001.144a2.25 2.25 0 01-.233.96 10.088 10.088 0 005.06-1.01.75.75 0 00.42-.643 4.875 4.875 0 00-6.957-4.611 8.586 8.586 0 011.71 5.157v.003z" />
                        </svg>
                        {product.subscribers.toLocaleString()} subs
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">${product.price.toLocaleString()}</div>
                      {product.income && product.income > 0 && (
                        <div className="text-xs text-green-600 flex items-center mt-1">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 mr-1">
                            <path d="M12 7.5a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5z" />
                            <path fillRule="evenodd" d="M1.5 4.875C1.5 3.839 2.34 3 3.375 3h17.25c1.035 0 1.875.84 1.875 1.875v9.75c0 1.036-.84 1.875-1.875 1.875H3.375A1.875 1.875 0 011.5 14.625v-9.75zM8.25 9.75a3.75 3.75 0 117.5 0 3.75 3.75 0 01-7.5 0zM18.75 9a.75.75 0 00-.75.75v.008c0 .414.336.75.75.75h.008a.75.75 0 00.75-.75V9.75a.75.75 0 00-.75-.75h-.008zM4.5 9.75A.75.75 0 015.25 9h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75H5.25a.75.75 0 01-.75-.75V9.75z" clipRule="evenodd" />
                            <path d="M2.25 18a.75.75 0 000 1.5h19.5a.75.75 0 000-1.5H2.25z" />
                          </svg>
                          ${product.income.toLocaleString()}/month
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <span className="px-3 py-1 inline-flex text-xs leading-5 font-medium rounded-full bg-green-100 text-green-800">
                        Active
                      </span>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        <Link 
                          href={`/products/${product.id}`}
                          className="text-indigo-600 hover:text-indigo-900 bg-indigo-50 p-2 rounded-md hover:bg-indigo-100 transition-colors"
                          title="View"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </Link>
                        <Link 
                          href={`/products/edit/${product.id}`}
                          className="text-blue-600 hover:text-blue-900 bg-blue-50 p-2 rounded-md hover:bg-blue-100 transition-colors"
                          title="Edit"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                          </svg>
                        </Link>
                        <button
                          onClick={() => handleDeleteProduct(product.id)}
                          disabled={deletingId === product.id}
                          className="text-red-600 hover:text-red-900 bg-red-50 p-2 rounded-md hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Delete"
                        >
                          {deletingId === product.id ? (
                            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
} 