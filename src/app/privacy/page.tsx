"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import UserMenu from "@/components/auth/UserMenu";

export default function PrivacyPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-[#1E1E29] text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            {/* Site logo with link to home */}
            <Link href="/" className="flex items-center">
              <span className="font-bold text-xl">Accs-market.com</span>
            </Link>
            
            <div className="flex items-center space-x-4">
              {/* Escrow service button */}
              <button className="bg-[#95D03A] hover:bg-opacity-90 text-white px-4 py-2 rounded-md">
                Escrow service
              </button>
              
              {/* Start selling button */}
              <button className="bg-[#6345ED] hover:bg-opacity-90 text-white px-4 py-2 rounded-md">
                Start selling
              </button>
              
              {/* User profile section */}
              {user && <UserMenu />}
              
              {!user && (
                <Link 
                  href="/login" 
                  className="bg-[#6345ED] hover:bg-opacity-90 text-white px-4 py-2 rounded-md"
                >
                  Login / Register
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>
      
      {/* Main content */}
      <main className="flex-grow bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Privacy Policy</h1>
          
          <div className="prose prose-lg max-w-none">
            <p>This page informs you of our policies regarding the collection, use and disclosure of Personal Information when you use our Service. We will not use or share your information with anyone except as described in this Privacy Policy.</p>

            <p>We use your Personal Information for providing and improving the Service. By using the Service, you agree to the collection and use of information in accordance with this policy. Unless otherwise defined in this Privacy Policy, terms used in this Privacy Policy have the same meanings as in our Terms and Conditions, accessible at accs-market.com</p>

            <h2 className="text-2xl font-bold mt-8 mb-4">Information Collection And Use</h2>
            <p>While using our Service, we may ask you to provide us with certain personally identifiable information that can be used to contact or identify you, and to provide escrow service. Personally identifiable information ("Personal Information") may include, but is not limited to:</p>
            
            <ul className="list-disc pl-5 my-4">
              <li>First Name</li>
              <li>Last Name</li>
              <li>Email address</li>
              <li>Сountry</li>
            </ul>

            <h2 className="text-2xl font-bold mt-8 mb-4">Log Data</h2>
            <p>We collect information that your browser sends whenever you visit our Service ("Log Data"). This Log Data may include information such as your computer's Internet Protocol ("IP") address, browser type, browser version, the pages of our Service that you visit, the time and date of your visit, the time spent on those pages and other statistics.</p>

            <h2 className="text-2xl font-bold mt-8 mb-4">Cookies</h2>
            <p>Cookies are files with small amount of data, which may include an anonymous unique identifier. Cookies are sent to your browser from a web site and stored on your computer's hard drive.</p>

            <p>We use "cookies" to collect information. You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent. However, if you do not accept cookies, you may not be able to use some portions of our Service.</p>

            <h2 className="text-2xl font-bold mt-8 mb-4">Service Providers</h2>
            <p>We may employ third party companies and individuals to facilitate our Service, to provide the Service on our behalf, to perform Service-related services or to assist us in analyzing how our Service is used.</p>

            <p>These third parties have access to your Personal Information only to perform these tasks on our behalf and are obligated not to disclose or use it for any other purpose.</p>

            <h2 className="text-2xl font-bold mt-8 mb-4">Security</h2>
            <p>The security of your Personal Information is important to us, but remember that no method of transmission over the Internet, or method of electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your Personal Information, we cannot guarantee its absolute security.</p>

            <h2 className="text-2xl font-bold mt-8 mb-4">Links To Other Sites</h2>
            <p>Our Service may contain links to other sites that are not operated by us. If you click on a third party link, you will be directed to that third party's site. We strongly advise you to review the Privacy Policy of every site you visit.</p>

            <p>We have no control over, and assume no responsibility for the content, privacy policies or practices of any third party sites or services.</p>

            <h2 className="text-2xl font-bold mt-8 mb-4">Children's Privacy</h2>
            <p>Our Service does not address anyone under the age of 18 ("Children").</p>

            <p>We do not knowingly collect personally identifiable information from children under 18. If you are a parent or guardian and you are aware that your child has provided us with Personal Information, please contact us. If we discover that a child under 18 has provided us with Personal Information, we will delete such information from our servers immediately.</p>

            <h2 className="text-2xl font-bold mt-8 mb-4">Changes To This Privacy Policy</h2>
            <p>This Privacy Policy was last updated on: July 19, 2019</p>

            <p>We may update our Privacy Policy from time to time. Should we update, amend or make any changes to our privacy policy, those changes will be posted here.</p>

            <p>You are advised to review this Privacy Policy periodically for any changes. Changes to this Privacy Policy are effective when they are posted on this page.</p>

            <h2 className="text-2xl font-bold mt-8 mb-4">Contact Us</h2>
            <p>If you have any questions about this Privacy Policy, please contact us.</p>
          </div>
        </div>
      </main>
      
      {/* Footer */}
      <footer className="bg-gray-900 text-white py-4 px-6 mt-auto">
        <div className="container mx-auto flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4 md:mb-0">
            <div className="text-sm">MateSwap LP</div>
            <div className="text-xs text-gray-400">Address: 85 First Floor Great Portland Street, London, England, W1W 7LT</div>
          </div>
          <div className="flex space-x-6">
            <Link href="/terms" className="text-sm hover:text-gray-300 transition-colors">
              Terms and Conditions
            </Link>
            <Link href="/privacy" className="text-sm hover:text-gray-300 transition-colors">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
} 