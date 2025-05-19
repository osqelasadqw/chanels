"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "./AuthProvider";

export default function UserMenu() {
  const { user, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  if (!user) return null;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 focus:outline-none"
      >
        <div className="h-8 w-8 rounded-full overflow-hidden">
          {user.photoURL ? (
            <Image
              src={user.photoURL}
              alt={user.name}
              width={32}
              height={32}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gray-300 flex items-center justify-center text-gray-600">
              {user.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <span className="hidden md:block font-medium">{user.name}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-10">
          <div className="px-4 py-2 border-b border-gray-200">
            <p className="text-sm font-medium">{user.name}</p>
            <p className="text-xs text-gray-500">{user.email}</p>
          </div>
          
          <Link href="/my-products" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
            My Products
          </Link>
          
          <Link href="/my-chats" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
            My Chats
          </Link>

          {user.isAdmin && (
            <>
              <Link href="/admin" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                Admin Panel
              </Link>
              <Link href="/admin/manage-admins" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                Manage Admins
              </Link>
            </>
          )}
          
          <button
            onClick={signOut}
            className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
} 