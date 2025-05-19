"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { 
  ADMIN_EMAILS, 
  addAdminEmail, 
  removeAdminEmail, 
  assignAdminRole, 
  removeAdminRole,
  findUserByEmail 
} from "@/firebase/userRoles";
import { doc, collection, query, where, getDocs, getDoc } from "firebase/firestore";
import { db } from "@/firebase/config";

export default function ManageAdminsPage() {
  const [adminEmails, setAdminEmails] = useState<string[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error", text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [existingAdmins, setExistingAdmins] = useState<{id: string, email: string, name: string, provider: string}[]>([]);
  const { user } = useAuth();
  const router = useRouter();

  // მხოლოდ ადმინისტრატორებს აქვთ ამ გვერდზე წვდომა
  useEffect(() => {
    if (user && !user.isAdmin) {
      router.push("/");
    }
  }, [user, router]);

  // ადმინების სიის ჩატვირთვა
  useEffect(() => {
    setAdminEmails([...ADMIN_EMAILS]);
    
    // არსებული ადმინების ჩატვირთვა ბაზიდან
    const loadExistingAdmins = async () => {
      try {
        setLoading(true);
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("isAdmin", "==", true));
        const querySnapshot = await getDocs(q);
        
        const admins: {id: string, email: string, name: string, provider: string}[] = [];
        
        querySnapshot.forEach((doc) => {
          const userData = doc.data();
          if (userData.email) {
            admins.push({
              id: doc.id,
              email: userData.email,
              name: userData.name || "უცნობი მომხმარებელი",
              provider: userData.authProvider || "unknown"
            });
          }
        });
        
        setExistingAdmins(admins);
        console.log("Loaded existing admins:", admins);
      } catch (error) {
        console.error("Error loading existing admins:", error);
      } finally {
        setLoading(false);
      }
    };
    
    loadExistingAdmins();
  }, []);

  const handleAddAdmin = async () => {
    if (!newAdminEmail.trim()) {
      setMessage({ type: "error", text: "გთხოვთ შეიყვანოთ ელფოსტა" });
      return;
    }

    try {
      setLoading(true);
      setMessage(null);

      // დავამატოთ ახალი ადმინ ელფოსტა
      const added = addAdminEmail(newAdminEmail);
      
      if (added) {
        setAdminEmails([...ADMIN_EMAILS]);
        setNewAdminEmail("");
        setMessage({ type: "success", text: `ელფოსტა ${newAdminEmail} წარმატებით დაემატა ადმინების სიაში` });
        
        // ვეძებთ მომხმარებელს ამ ელფოსტით ბაზაში და ვანიჭებთ ადმინის უფლებებს
        const user = await findUserByEmail(newAdminEmail);
        
        if (user) {
          await assignAdminRole(user.userId);
          console.log(`მომხმარებელს ID: ${user.userId} მიენიჭა ადმინის უფლებები`);
          
          // დავამატოთ ახალი ადმინი სიაში
          setExistingAdmins(prev => [...prev, {
            id: user.userId,
            email: user.userData.email,
            name: user.userData.name || "უცნობი მომხმარებელი",
            provider: user.userData.authProvider || "unknown"
          }]);
        } else {
          console.log(`მომხმარებელი ელფოსტით ${newAdminEmail} ვერ მოიძებნა ბაზაში. უფლებები მიენიჭება პირველი ავტორიზაციისას.`);
        }
      } else {
        setMessage({ type: "error", text: `ელფოსტა ${newAdminEmail} უკვე არსებობს ადმინების სიაში` });
      }
    } catch (error) {
      console.error("Error adding admin:", error);
      setMessage({ type: "error", text: "შეცდომა ადმინის დამატებისას" });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAdmin = async (email: string) => {
    try {
      setLoading(true);
      setMessage(null);

      // წავშალოთ ადმინ ელფოსტა
      const removed = removeAdminEmail(email);
      
      if (removed) {
        setAdminEmails([...ADMIN_EMAILS]);
        setMessage({ type: "success", text: `ელფოსტა ${email} წარმატებით წაიშალა ადმინების სიიდან` });
        
        // წავშალოთ ადმინის უფლებები ბაზიდანაც თუ მომხმარებელი არსებობს
        const user = await findUserByEmail(email);
        if (user) {
          await removeAdminRole(user.userId);
          console.log(`მომხმარებელს ID: ${user.userId} მოეხსნა ადმინის უფლებები`);
          
          // წავშალოთ ადმინი სიიდან
          setExistingAdmins(prev => prev.filter(admin => admin.email !== email));
        }
      } else {
        setMessage({ type: "error", text: `ელფოსტა ${email} ვერ მოიძებნა ადმინების სიაში` });
      }
    } catch (error) {
      console.error("Error removing admin:", error);
      setMessage({ type: "error", text: "შეცდომა ადმინის წაშლისას" });
    } finally {
      setLoading(false);
    }
  };

  if (!user || !user.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <div className="text-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-red-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h2 className="text-xl font-semibold mt-4">წვდომა აკრძალულია</h2>
            <p className="text-gray-600 mt-2">თქვენ არ გაქვთ უფლება ამ გვერდზე შესასვლელად.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">ადმინისტრატორების მართვა</h1>
      
      {message && (
        <div className={`p-4 mb-6 rounded-md ${message.type === "success" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
          {message.text}
        </div>
      )}
      
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-lg font-medium mb-4">ადმინისტრატორის დამატება</h2>
        
        <div className="flex gap-4">
          <input
            type="email"
            value={newAdminEmail}
            onChange={(e) => setNewAdminEmail(e.target.value)}
            placeholder="ახალი ადმინის ელფოსტა"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleAddAdmin}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {loading ? "დამუშავება..." : "დამატება"}
          </button>
        </div>
        
        <p className="text-sm text-gray-500 mt-2">
          ადმინისტრატორის ელფოსტის დამატებისას, თუ მომხმარებელი უკვე დარეგისტრირებულია, ავტომატურად მიენიჭება ადმინის უფლებები.
          წინააღმდეგ შემთხვევაში, მომხმარებელი მიიღებს ადმინის უფლებებს პირველივე ავტორიზაციისას.
        </p>
      </div>
      
      {/* ადმინისტრატორების განახლებული სია */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-medium mb-4">წინასწარ განსაზღვრული ადმინები</h2>
          
          {adminEmails.length === 0 ? (
            <p className="text-gray-500">ადმინისტრატორების სია ცარიელია</p>
          ) : (
            <ul className="divide-y divide-gray-200">
              {adminEmails.map((email) => (
                <li key={email} className="py-3 flex justify-between items-center">
                  <span>{email}</span>
                  <button
                    onClick={() => handleRemoveAdmin(email)}
                    disabled={loading}
                    className="text-red-600 hover:text-red-800 focus:outline-none"
                  >
                    წაშლა
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-medium mb-4">არსებული ადმინისტრატორები</h2>
          
          {existingAdmins.length === 0 ? (
            <p className="text-gray-500">ბაზაში არ მოიძებნა აქტიური ადმინისტრატორები</p>
          ) : (
            <ul className="divide-y divide-gray-200">
              {existingAdmins.map((admin) => (
                <li key={admin.id} className="py-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">{admin.name}</p>
                      <p className="text-sm text-gray-500">{admin.email}</p>
                      <p className="text-xs text-gray-400">
                        ავთენტიფიკაცია: {admin.provider === "google" ? "Google" : 
                                       admin.provider === "vercel" ? "Vercel" :
                                       admin.provider === "github" ? "GitHub" : admin.provider}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoveAdmin(admin.email)}
                      disabled={loading}
                      className="text-red-600 hover:text-red-800 focus:outline-none"
                    >
                      წაშლა
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-lg font-medium mb-4">ინფორმაცია ადმინისტრატორების შესახებ</h2>
        
        <div className="prose prose-sm text-gray-700">
          <p>
            ადმინისტრატორები შეიძლება დარეგისტრირდნენ სხვადასხვა პროვაიდერებით (Google, Vercel, GitHub).
            მათ აქვთ წვდომა სისტემის ადმინისტრირების ფუნქციებზე.
          </p>
          <p className="mt-2">
            ადმინის როლის მინიჭება ხდება ორი გზით:
          </p>
          <ul className="list-disc list-inside mt-1">
            <li>მომხმარებლის ელფოსტის დამატებით წინასწარ განსაზღვრულ ადმინების სიაში</li>
            <li>უკვე დარეგისტრირებული მომხმარებლისთვის ადმინის როლის პირდაპირი მინიჭებით</li>
          </ul>
        </div>
      </div>
    </div>
  );
} 