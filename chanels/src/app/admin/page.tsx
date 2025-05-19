"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/components/auth/AuthProvider";
import AdminChatList from "@/components/chat/AdminChatList";
import EscrowChatList from "@/components/chat/EscrowChatList";
import ChatInterface from "@/components/chat/ChatInterface";
import { collection, query, getDocs, orderBy, deleteDoc, doc, limit, where, startAt, endAt } from "firebase/firestore";
import { db } from "@/firebase/config";
import { Product } from "@/types/product";

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState<{[key: string]: boolean}>({});
  const [error, setError] = useState<string | null>(null);
  const [showProductsModal, setShowProductsModal] = useState(false);
  const [showEscrowChats, setShowEscrowChats] = useState(false);
  const [selectedChatIdForAdmin, setSelectedChatIdForAdmin] = useState<string | null>(null);
  const [currentAdminProductId, setCurrentAdminProductId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [lastProductName, setLastProductName] = useState<string | null>(null);
  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  const productsPerPage = 20; // რამდენი პროდუქტი გამოჩნდეს ერთ გვერდზე
  const [deleteConfirmation, setDeleteConfirmation] = useState<string | null>(null);

  // Redirect if not admin
  useEffect(() => {
    if (!loading && (!user || !user.isAdmin)) {
      router.push("/");
    }
  }, [user, loading, router]);

  // კასტომ ივენთის მოსმენა AdminChatList კომპონენტიდან
  useEffect(() => {
    const handleOpenProductsModal = () => setShowProductsModal(true);
    const handleOpenEscrowChatsModal = () => setShowEscrowChats(true);

    window.addEventListener('openProductsModal', handleOpenProductsModal);
    window.addEventListener('openEscrowChatsModal', handleOpenEscrowChatsModal);
    
    return () => {
      window.removeEventListener('openProductsModal', handleOpenProductsModal);
      window.removeEventListener('openEscrowChatsModal', handleOpenEscrowChatsModal);
    };
  }, []);

  // პროდუქტების ჩატვირთვა მხოლოდ მაშინ, როცა მოდალი გაიხსნება
  useEffect(() => {
    const fetchProducts = async () => {
      if (!user?.isAdmin || !showProductsModal) return;
      
      try {
        setProductsLoading(true);
        setError(null);
        
        // თუ საძიებო ველი ცარიელი არაა, მაშინ ძებნის მიხედვით მოვძებნოთ
        if (searchTerm.trim()) {
          const q = query(
            collection(db, "products"),
            where("displayName", ">=", searchTerm),
            where("displayName", "<=", searchTerm + "\uf8ff"),
            limit(productsPerPage)
          );
          
          const querySnapshot = await getDocs(q);
          const productsList = querySnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data()
          })) as Product[];
          
          setProducts(productsList);
          setFilteredProducts(productsList);
          setHasMoreProducts(productsList.length === productsPerPage);
          
          if (productsList.length > 0) {
            setLastProductName(productsList[productsList.length - 1].displayName);
          }
        } else {
          // ჩვეულებრივი ჩატვირთვა თარიღის მიხედვით
          const q = query(
            collection(db, "products"),
            orderBy("createdAt", "desc"),
            limit(productsPerPage)
          );
          
          const querySnapshot = await getDocs(q);
          const productsList = querySnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data()
          })) as Product[];
          
          setProducts(productsList);
          setFilteredProducts(productsList);
          setHasMoreProducts(productsList.length === productsPerPage);
          
          if (productsList.length > 0) {
            setLastProductName(productsList[productsList.length - 1].displayName);
          }
        }
      } catch (err) {
        console.error("Error fetching products:", err);
        setError("პროდუქტების ჩატვირთვა ვერ მოხერხდა");
      } finally {
        setProductsLoading(false);
      }
    };
    
    if (showProductsModal) {
      fetchProducts();
    }
  }, [user, showProductsModal, searchTerm]);

  // მეტი პროდუქტის ჩატვირთვა
  const loadMoreProducts = async () => {
    if (!user?.isAdmin || isLoadingMore || !lastProductName) return;
    
    try {
      setIsLoadingMore(true);
      
      let q;
      
      // თუ საძიებო ველი ცარიელი არაა, მაშინ ძებნის მიხედვით მოვძებნოთ
      if (searchTerm.trim()) {
        q = query(
          collection(db, "products"),
          where("displayName", ">=", searchTerm),
          where("displayName", "<=", searchTerm + "\uf8ff"),
          startAt(lastProductName),
          limit(productsPerPage)
        );
      } else {
        q = query(
          collection(db, "products"),
          orderBy("createdAt", "desc"),
          startAt(lastProductName),
          limit(productsPerPage)
        );
      }
      
      const querySnapshot = await getDocs(q);
      const newProducts = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      })) as Product[];
      
      if (newProducts.length === 0 || newProducts.length < productsPerPage) {
        setHasMoreProducts(false);
      } else {
        setLastProductName(newProducts[newProducts.length - 1].displayName);
      }
      
      // გამოვრიცხოთ დუბლიკატები
      const updatedProducts = [...products, ...newProducts.filter(
        (newProduct) => !products.some(product => product.id === newProduct.id)
      )];
      
      setProducts(updatedProducts);
      setFilteredProducts(updatedProducts);
    } catch (err) {
      console.error("Error loading more products:", err);
      setError("დამატებითი პროდუქტების ჩატვირთვა ვერ მოხერხდა");
    } finally {
      setIsLoadingMore(false);
    }
  };

  // საძიებო ველის მნიშვნელობის ცვლილება
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  // პროდუქტის წაშლის ფუნქცია
  const handleDeleteProduct = async (productId: string) => {
    if (!user?.isAdmin) return;
    
    const confirmDelete = window.confirm("დარწმუნებული ხართ, რომ გსურთ პროდუქტის წაშლა?");
    if (!confirmDelete) return;
    
    try {
      setDeleteLoading(prev => ({ ...prev, [productId]: true }));
      
      await deleteDoc(doc(db, "products", productId));
      
      // წაშლის შემდეგ განახლება
      const updatedProducts = products.filter(product => product.id !== productId);
      setProducts(updatedProducts);
      setFilteredProducts(updatedProducts);
    } catch (err) {
      console.error("Error deleting product:", err);
      setError("პროდუქტის წაშლა ვერ მოხერხდა");
    } finally {
      setDeleteLoading(prev => ({ ...prev, [productId]: false }));
    }
  };

  // Handler for selecting a chat in EscrowChatList
  const handleAdminChatSelect = (chatId: string, productId: string) => {
    setSelectedChatIdForAdmin(chatId);
    setCurrentAdminProductId(productId);
    // Optionally, you might want to close the EscrowChats modal when a chat is selected
    // setShowEscrowChats(false); 
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user || !user.isAdmin) {
    return null; // Will redirect due to the useEffect
  }

  return (
    <div className="w-full px-4 py-4 admin-page-container">
      
      <div className="mb-6 grid grid-cols-1 md:grid-cols-1 gap-4">
       
      </div>
      
      <div className="mb-6 bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-xl border border-gray-200 overflow-hidden w-full">
        <AdminChatList />
      </div>
      
      {/* პროდუქტების მართვის მოდალური ფანჯარა */}
      {showProductsModal && (
        <div className="fixed inset-0 z-50 flex justify-center items-center bg-black bg-opacity-50">
          <div className="bg-white w-full h-screen flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-2xl font-bold text-gray-800">პროდუქტების მართვა</h3>
              <button 
                onClick={() => setShowProductsModal(false)}
                className="text-gray-400 hover:text-gray-500 focus:outline-none"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6 overflow-auto flex-grow">
              {/* საძიებო ველი */}
              <div className="mb-6">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bgBuy this channel-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="პროდუქტის სახელი..."
                    value={searchTerm}
                    onChange={handleSearchChange}
                  />
                </div>
              </div>
            
              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                  {error}
                </div>
              )}
              
              {productsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                </div>
              ) : (
                <div className="bg-white overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            პროდუქტი
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            ფასი
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            კატეგორია
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            მომხმარებელი
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            თარიღი
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            მოქმედება
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredProducts.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                              {searchTerm 
                                ? `პროდუქტი სახელით "${searchTerm}" არ მოიძებნა` 
                                : "პროდუქტები არ მოიძებნა"}
                            </td>
                          </tr>
                        ) : (
                          filteredProducts.map((product) => (
                            <tr key={product.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center">
                                  <div className="flex-shrink-0 h-10 w-10 mr-3">
                                    {product.imageUrls && product.imageUrls.length > 0 ? (
                                      <Image
                                        src={product.imageUrls[0]}
                                        alt={product.displayName}
                                        width={40}
                                        height={40}
                                        className="h-10 w-10 rounded-full object-cover"
                                      />
                                    ) : (
                                      <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                                        <span className="text-gray-500">ფ/გ</span>
                                      </div>
                                    )}
                                  </div>
                                  <div>
                                    <div className="text-sm font-medium text-gray-900 truncate max-w-xs">
                                      <Link href={`/products/${product.id}`} className="hover:text-blue-600">
                                        {product.displayName}
                                      </Link>
                                    </div>
                                    <div className="text-sm text-gray-500">{product.subscribers?.toLocaleString() || 0} გამომწერი</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-900">${product.price}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-900">{product.category}</div>
                                <div className="text-sm text-gray-500">{product.platform}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-900 truncate max-w-[150px]">{product.userEmail}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {product.createdAt ? new Date(product.createdAt).toLocaleDateString() : 'N/A'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <button
                                  onClick={() => handleDeleteProduct(product.id)}
                                  disabled={deleteLoading[product.id]}
                                  className="text-red-600 hover:text-red-900 font-semibold"
                                >
                                  {deleteLoading[product.id] ? 'იშლება...' : 'წაშლა'}
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* "მეტის ჩატვირთვა" ღილაკი */}
                  {hasMoreProducts && (
                    <div className="flex justify-center mt-4">
                      <button
                        onClick={loadMoreProducts}
                        disabled={isLoadingMore}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
                      >
                        {isLoadingMore ? 'იტვირთება...' : 'მეტის ჩატვირთვა'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Escrow (პირადი) ჩატების მოდალური ფანჯარა/სექცია - განახლებული განლაგებით */}
      {showEscrowChats && (
        <div className="fixed inset-0 z-50 flex justify-center items-center bg-black bg-opacity-60 p-0">
          <div className="bg-white w-full h-full rounded-none shadow-2xl flex flex-col overflow-hidden border-none">
            {/* Modal Header */}
            <div className="px-5 py-3 border-b border-gray-200 flex justify-between items-center bg-gray-50 rounded-t-none">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6.8 3.11 2.19 4.024C6.07 18.332 7.5 19.5 9 19.5h6c1.5 0 2.93-1.168 3.99-2.715.32-.297.71-.53 1.13-.69M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
                </svg>
                პირადი ჩატები (Escrow)
              </h3>
              <button 
                onClick={() => {
                  setShowEscrowChats(false);
                  setSelectedChatIdForAdmin(null); // Clear selected chat on modal close
                }}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-200 transition-colors duration-150 focus:outline-none"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Modal Body - Two Pane Layout */}
            <div className="flex flex-1 overflow-hidden">
              {/* Left Pane: Chat List */}
              <div className="w-full sm:w-2/5 md:w-1/3 lg:w-1/4 border-r border-gray-200 overflow-y-auto bg-gray-50">
                <EscrowChatList 
                  onChatSelect={handleAdminChatSelect} 
                  selectedChatId={selectedChatIdForAdmin} 
                />
              </div>
              {/* Right Pane: Chat Interface or Placeholder */}
              <div className="flex-1 flex flex-col overflow-hidden bg-white">
                {selectedChatIdForAdmin ? (
                  <ChatInterface 
                    chatId={selectedChatIdForAdmin} 
                    productId={currentAdminProductId} 
                  />
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-500 p-6 sm:p-10">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <h4 className="text-lg font-medium text-gray-700 mb-1">აირჩიეთ ჩატი</h4>
                    <p className="text-sm max-w-xs">
                      პირადი (ესქროუ) ჩატის გასაგრძელებლად, გთხოვთ, აირჩიოთ შესაბამისი ჩატი მარცხენა პანელიდან.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 