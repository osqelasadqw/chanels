"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import UserMenu from "@/components/auth/UserMenu";

export default function TermsPage() {
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
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Terms and Conditions</h1>
          
          <div className="prose prose-lg max-w-none">
            <p>Please read these Terms of Use ("Terms", "Terms of Use") carefully before using the Accs-market.com website (the "Service").</p>

            <p>Your access to and use of the Service is conditioned on your acceptance of and compliance with these Terms. These Terms apply to all visitors, users and others who access or use the Service.</p>

            <p>By accessing or using the Service you agree to be bound by these Terms. If you disagree with any part of these Terms, you may not access the Service.</p>

            <h2 className="text-2xl font-bold mt-8 mb-4">Privacy</h2>
            <p>Please read our <Link href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link> for a better understanding of data which Accs-market stores.</p>

            <h2 className="text-2xl font-bold mt-8 mb-4">About Accs-market</h2>
            <p>Accs-market is an independent platform for the exchange of social media pages.</p>

            <p>By accessing or using accs-market.com, you agree to be bound by the terms and conditions set forth below:</p>

            <ul className="list-disc pl-5 my-4">
              <li>Accs-market is not an auctioneer;</li>
              <li>Accs-market does not sell Digital Assets on behalf of Sellers;</li>
              <li>Accs-market does not grant full completion of the agreement between the Buyer and Seller for the sale of Digital Assets;</li>
              <li>Accs-market does not grant the accuracy of the information provided by the Buyer or Seller;</li>
              <li>Accs-market is not responsible for what happens to the Digital Assets Seller and Buyer at any time;</li>
              <li>Accs-market is not a Party to any agreement and is not responsible for any actions or lack of any Seller or Buyer.</li>
            </ul>

            <p>All negotiations and tenders take place between the Seller and Buyer.</p>

            <p>Accs-market can help resolve disputes between the parties by using the Accs-market Escrow Service, but Accs-market cannot monitor and guarantee: the availability, quality, safety and legality of the Digital Assets added; the veracity of the information provided by the Seller and Buyer; the Seller's ability to transfer an account; the Buyer's ability to pay for a Digital Asset.</p>

            <h2 className="text-2xl font-bold mt-8 mb-4">Acceptable Use</h2>
            <p>You must not use this website in any way that causes, or may cause, damage to the website or impairment of the availability or accessibility of accs-market.com, or in any way which is unlawful, illegal, fraudulent or harmful, or in connection with any unlawful, illegal, fraudulent or harmful purpose or activity.</p>

            <p>You must not use this website to copy, store, host, transmit, send, use, publish or distribute any material which consists of (or is linked to) any spyware, computer virus, Trojan horse, worm, keystroke logger, rootkit or other malicious computer software.</p>

            <p>You must not conduct any systematic or automated data collection activities on this website.</p>

            <p>This includes:</p>
            <ul className="list-disc pl-5 my-4">
              <li>Scraping</li>
              <li>Data mining</li>
              <li>Data extraction</li>
              <li>Data harvesting</li>
              <li>'Framing' (iframes)</li>
              <li>Article 'Spinning'</li>
            </ul>

            <p>You must not use this website or any part of it to transmit or send unsolicited commercial communications.</p>

            <p>It is also prohibited to:</p>
            <ul className="list-disc pl-5 my-4">
              <li>Use the service if you are under 18 years of age</li>
              <li>Create more than one account on our service</li>
              <li>Create a new account after blocking the previous one</li>
              <li>Pretend to be someone else or provide inaccurate information</li>
              <li>Distribute spam or send mass emails to the service users or administration</li>
              <li>Violate any intellectual property rights of third parties</li>
              <li>Interfere with our services or create an unacceptably high load on our website</li>
              <li>Store any information about service users without their consent</li>
            </ul>
            
            <h2 className="text-2xl font-bold mt-8 mb-4">Geographical Restrictions</h2>
            <p>Users who are residents of, or are accessing the platform from, following countries and regions are prohibited from accessing or using our services: Iran, North Korea, Syria, Russia, Belarus, Donetsk, Luhansk, and Crimea regions, Myanmar, Albania, Barbados, Burkina Faso, Cambodia, Cayman Islands, Democratic Republic of the Congo, Gibraltar, Haiti, Jamaica, Jordan, Mali, Morocco, Mozambique, Panama, Philippines, Senegal, South Sudan, Tanzania, Turkey, Uganda, United Arab Emirates, Yemen, Cuba, Afghanistan, Venezuela, Zimbabwe, Lebanon, or any other jurisdiction subject to UK, EU, OFAC, or UN sanctions</p>

            <h2 className="text-2xl font-bold mt-8 mb-4">Prohibited Content</h2>
            <p>The sale of channels containing the following types of content is strictly prohibited:</p>
            <ul className="list-disc pl-5 my-4">
              <li>Illegal or criminal content</li>
              <li>Pornographic or explicit material</li>
              <li>Hate speech, violence, or threats</li>
              <li>Extremist or terrorist content</li>
              <li>Misinformation, political manipulation, or propaganda</li>
              <li>Gambling or betting (unless legally licensed)</li>
              <li>Compromised or stolen channels</li>
              <li>Activities violating the terms of the original platform (e.g., YouTube Terms of Service)</li>
            </ul>

            <h2 className="text-2xl font-bold mt-8 mb-4">Member Accounts</h2>
            <p>When you create an account with us, you must provide us with information that is accurate, complete, and current at all times. Failure to do so constitutes a breach of the Terms, which may result in immediate termination of your account on our Service.</p>

            <p>You are responsible for safeguarding the password that you use to access the Service and for any activities or actions under your password, whether your password is with our Service or a third-party service.</p>

            <p>You agree not to disclose your password to any third party. You must notify us immediately upon becoming aware of any breach of security or unauthorized use of your account.</p>

            <p>Accs-market reserves the right at any time to suspend your account, with or without notice to you, and for any reason in its sole and absolute discretion.</p>

            <h2 className="text-2xl font-bold mt-8 mb-4">Contact Us</h2>
            <p>Please contact us if you have any questions about these Terms.</p>
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