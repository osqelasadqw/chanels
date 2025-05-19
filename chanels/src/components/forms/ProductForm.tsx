"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { useAuth } from "@/components/auth/AuthProvider";
import { collection, addDoc, query, where, getDocs } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/firebase/config";
import Image from "next/image";

const platforms = ["YouTube", "TikTok", "Twitter", "Instagram", "Facebook", "Telegram"];

interface ProductFormData {
  accountLink: string;
  displayName: string;
  subscribers: number;
  category: string;
  platform: string;
  price: number;
  allowComments: boolean;
  description: string;
  income: number;
  expenses: number;
  incomeSource: string;
  expenseDetails: string;
  promotionStrategy: string;
  supportRequirements: string;
  monetizationEnabled: boolean;
  imageUrls: string[];
  channelLogo?: string;
}

const initialFormData: ProductFormData = {
  accountLink: "",
  displayName: "",
  subscribers: 0,
  category: "",
  platform: "YouTube",
  price: 0,
  allowComments: true,
  description: "",
  income: 0,
  expenses: 0,
  incomeSource: "",
  expenseDetails: "",
  promotionStrategy: "",
  supportRequirements: "",
  monetizationEnabled: false,
  imageUrls: [],
  channelLogo: ""
};

export default function ProductForm() {
  const [formData, setFormData] = useState<ProductFormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidChannel, setIsValidChannel] = useState(false);
  const [isChannelAlreadyUploaded, setIsChannelAlreadyUploaded] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { user } = useAuth();
  
  // ფუნქცია არხის სახელის ამოღებით URL-დან
  // მაგ.: https://www.youtube.com/@channelname -> channelname
  const extractChannelNameFromUrl = (url: string): string | null => {
    try {
      // Check if it's a valid URL
      if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
        return null;
      }
      
      // Get channel name directly if it starts with @ symbol
      const atMatch = url.match(/youtube\.com\/@([^\/\?]+)/);
      if (atMatch && atMatch[1]) {
        return atMatch[1];
      }
      
      // Define by channel ID
      const channelMatch = url.match(/youtube\.com\/channel\/([^\/\?]+)/);
      if (channelMatch && channelMatch[1]) {
        return channelMatch[1];
      }
      
      // Define by c/ prefix
      const cMatch = url.match(/youtube\.com\/c\/([^\/\?]+)/);
      if (cMatch && cMatch[1]) {
        return cMatch[1];
      }
      
      // Define by user/ prefix
      const userMatch = url.match(/youtube\.com\/user\/([^\/\?]+)/);
      if (userMatch && userMatch[1]) {
        return userMatch[1];
      }
      
      return null;
    } catch (e) {
      console.error("Error extracting channel name:", e);
      return null;
    }
  };

  // Function for calling YouTube API
  const fetchYoutubeChannelData = async (url: string) => {
    try {
      // setIsLoading(true) -- უკვე დაყენებულია უფრო ადრე
      setIsValidChannel(false);
      
      // Try to extract channel name from URL
      const channelQuery = extractChannelNameFromUrl(url);
      
      if (!channelQuery) {
        console.log("Could not extract channel identifier from URL:", url);
        setIsLoading(false);
        return;
      }
      
      // პირდაპირ ვამოწმებთ თუ URL-ში არის ცნობილი იდენტიფიკატორი
      let channelId;
      
      // პირდაპირ ამოვიღოთ channel ID, თუ უკვე URL-ში არის
      const channelIdMatch = url.match(/youtube\.com\/channel\/([^\/\?]+)/);
      if (channelIdMatch && channelIdMatch[1]) {
        channelId = channelIdMatch[1];
      } else {
        // სხვა შემთხვევაში გამოვიყენოთ search API
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${channelQuery}&type=channel&maxResults=1&key=${process.env.NEXT_PUBLIC_YOUTUBE_API_KEY}`;
        
        const searchResponse = await fetch(searchUrl);
        const searchData = await searchResponse.json();
        
        if (!searchData.items || searchData.items.length === 0) {
          console.log("No channels found for query:", channelQuery);
          setIsLoading(false);
          return;
        }
        
        // Get channel ID from search results
        channelId = searchData.items[0].id.channelId;
      }
      
      // პარალელური მოთხოვნა მონაცემების უფრო სწრაფად წამოსაღებად
      const channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}&key=${process.env.NEXT_PUBLIC_YOUTUBE_API_KEY}`;
      
      const channelResponse = await fetch(channelUrl);
      const channelData = await channelResponse.json();
      
      if (channelData.items && channelData.items.length > 0) {
        const channel = channelData.items[0];
        
        // Get channel logo/thumbnail from the API response
        let channelLogo = "";
        if (channel.snippet.thumbnails) {
          // Try to get the highest quality thumbnail available
          if (channel.snippet.thumbnails.high) {
            channelLogo = channel.snippet.thumbnails.high.url;
          } else if (channel.snippet.thumbnails.medium) {
            channelLogo = channel.snippet.thumbnails.medium.url;
          } else if (channel.snippet.thumbnails.default) {
            channelLogo = channel.snippet.thumbnails.default.url;
          }
        }
        
        console.log("Channel logo URL:", channelLogo);
        
        // Fill form data
        setFormData(prev => ({
          ...prev,
          displayName: channel.snippet.title || "",
          // Process subscriber count as a number
          subscribers: parseInt(channel.statistics.subscriberCount) || 0,
          channelLogo: channelLogo // შევინახოთ არხის ლოგოს URL
        }));
        
        // Mark that the channel has been found and is valid
        setIsValidChannel(true);
        
        console.log("Successfully retrieved channel data:", channel.snippet.title);
      } else {
        console.log("No channel details found for ID:", channelId);
      }
    } catch (error) {
      console.error("Error fetching YouTube channel data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Check if the account link already exists in Firestore
  const checkIfChannelExists = async (link: string) => {
    try {
      if (!link.trim()) return false;
      
      // არხის ლინკის ნორმალიზება შედარებისთვის
      let normalizedLink = link.trim().toLowerCase();
      normalizedLink = normalizedLink.replace(/^(https?:\/\/)?(www\.)?/, "");
      normalizedLink = normalizedLink.replace(/\/$/, "");
      
      // YouTube ლინკის დამატებითი ნორმალიზაცია
      if (normalizedLink.includes("youtube.com") || normalizedLink.includes("youtu.be")) {
        // განვასხვავოთ youtube არხის ფორმატები და ვსცადოთ მათი ნორმალიზაცია
        const youtubePatterns = [
          /youtube\.com\/channel\/([^\/\?]+)/,  // channel ID-ით
          /youtube\.com\/c\/([^\/\?]+)/,         // მოკლე სახელით
          /youtube\.com\/@([^\/\?]+)/,          // @ სიმბოლოიანი სახელით
          /youtube\.com\/user\/([^\/\?]+)/      // ძველი ფორმატის სახელით
        ];
        
        let channelIdentifier = null;
        
        // შევამოწმოთ თითოეული პატერნი
        for (const pattern of youtubePatterns) {
          const match = normalizedLink.match(pattern);
          if (match && match[1]) {
            channelIdentifier = match[1];
            break;
          }
        }
        
        // თუ ვიპოვეთ არხის იდენტიფიკატორი, ვიყენებთ მას ძიებისთვის
        if (channelIdentifier) {
          console.log("Extracted channel identifier:", channelIdentifier);
          
          // Firestore ძიება შემოსული ლინკის ან იდენტიფიკატორის მიხედვით
          const channelsRef = collection(db, "products");
          
          // შევქმნათ ვარიანტები იდენტიფიკატორის გამოყენებით
          const variantsWithIdentifier = [
            `youtube.com/channel/${channelIdentifier}`,
            `youtube.com/c/${channelIdentifier}`,
            `youtube.com/@${channelIdentifier}`,
            `youtube.com/user/${channelIdentifier}`
          ];
          
          // შევამოწმოთ თითოეული ვარიანტი
          for (const variant of variantsWithIdentifier) {
            try {
              const q = query(
                channelsRef, 
                where("accountLink", "==", `https://${variant}`)
              );
              
              const querySnapshot = await getDocs(q);
              
              if (!querySnapshot.empty) {
                // დამატებითი ფილტრაცია კოდში
                const userId = user?.id;
                const isUploadedByOther = querySnapshot.docs.some(doc => {
                  const data = doc.data();
                  return userId ? data.userId !== userId : true;
                });
                
                if (isUploadedByOther) {
                  setIsChannelAlreadyUploaded(true);
                  return true;
                }
              }
            } catch (e) {
              console.error("Error in channel query:", e);
              continue;
            }
          }
        }
      }
      
      // Firestore ძიება - ყველა შესაძლო ვარიანტისთვის
      const channelsRef = collection(db, "products");
      
      // შევქმნათ რამდენიმე ვარიანტი შემოწმებისთვის
      const variants = [
        normalizedLink,
        `http://${normalizedLink}`,
        `https://${normalizedLink}`,
        `http://www.${normalizedLink}`,
        `https://www.${normalizedLink}`
      ];
      
      // მხოლოდ ამ მომხმარებლის არ იყოს ატვირთული
      const userId = user?.id;
      
      // მივიღოთ მხოლოდ უნიკალური ვარიანტები
      const uniqueVariants = [...new Set(variants)];
      
      // შევამოწმოთ თითოეული ვარიანტი
      for (const variant of uniqueVariants) {
        // ბაზაში პირველადი შემოწმება - გამოვიყენოთ მხოლოდ ერთი where ოპერატორი
        // ინდექსის შეცდომის თავიდან ასაცილებლად
        const q = query(
          channelsRef, 
          where("accountLink", "==", variant)
        );
        
        try {
          const querySnapshot = await getDocs(q);
          
          if (!querySnapshot.empty) {
            // დამატებითი ფილტრაცია კოდში - შევამოწმოთ არის თუ არა უკვე ატვირთული იმავე მომხმარებლის მიერ
            const isUploadedByOther = querySnapshot.docs.some(doc => {
              const data = doc.data();
              return userId ? data.userId !== userId : true;
            });
            
            if (isUploadedByOther) {
              setIsChannelAlreadyUploaded(true);
              return true;
            }
          }
        } catch (e) {
          console.error("Error in query execution:", e);
          // გააგრძელე შემდეგი ვარიანტის შემოწმება
          continue;
        }
      }
      
      setIsChannelAlreadyUploaded(false);
      return false;
    } catch (error) {
      console.error("Error checking if channel exists:", error);
      return false;
    }
  };

  // Watch for accountLink changes
  useEffect(() => {
    // დავაყენოთ ჩატვირთვის ანიმაცია დაუყოვნებლივ, თუ ლინკი არის YouTube-ის
    if (formData.accountLink && 
      (formData.accountLink.includes('youtube.com') || formData.accountLink.includes('youtu.be'))) {
      setIsLoading(true);
    }
    
    const timeoutId = setTimeout(async () => {
      if (!formData.accountLink.trim()) {
        setIsValidChannel(false);
        setIsChannelAlreadyUploaded(false);
        setIsLoading(false);
        return;
      }
      
      const isYoutubeLink = formData.accountLink && 
        (formData.accountLink.includes('youtube.com') || formData.accountLink.includes('youtu.be'));
      
      const isValidYoutubeLink = isYoutubeLink && 
        extractChannelNameFromUrl(formData.accountLink) !== null;
      
      // შევამოწმოთ არსებობს თუ არა უკვე ეს არხი
      if (formData.accountLink.trim()) {
        const channelExists = await checkIfChannelExists(formData.accountLink);
        if (channelExists) {
          setIsValidChannel(false);
          setIsLoading(false);
        }
      }
      
      // ავტომატურად გადართვა იუთუბზე თუ იუთუბის ლინკია
      if (isYoutubeLink && formData.platform !== "YouTube") {
        setFormData(prev => ({
          ...prev,
          platform: "YouTube"
        }));
      }
      
      // თუ პლატფორმა იუთუბია, უნდა სრულად შემოწმდეს
      if (formData.platform === "YouTube") {
        if (isValidYoutubeLink && !isChannelAlreadyUploaded) {
          fetchYoutubeChannelData(formData.accountLink);
        } else {
          setIsValidChannel(false);
          setIsLoading(false);
        }
      } else if (formData.accountLink && !isChannelAlreadyUploaded) {
        // სხვა პლატფორმებისთვის საკმარისია უბრალოდ ბმულის არსებობა
        setIsValidChannel(formData.accountLink.trim() !== "");
        setIsLoading(false);
      } else {
        setIsValidChannel(false);
        setIsLoading(false);
      }
    }, 300); // 300 მილიწამიანი დაყოვნება ნაცვლად 1000-ისა
    
    return () => clearTimeout(timeoutId);
  }, [formData.accountLink, formData.platform, isChannelAlreadyUploaded]);

  // აქვე ვაინიციალიზებთ დეფოლტ მნიშვნელობებს
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      incomeSource: "",
      expenseDetails: "",
      promotionStrategy: "",
      supportRequirements: ""
    }));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : 
              type === 'checkbox' ? (e.target as HTMLInputElement).checked : 
              value
    }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      // მაქსიმუმ 6 ფაილის არჩევა
      const maxFiles = 6;
      const selectedFiles = Array.from(files).slice(0, maxFiles);
      
      // თუ უკვე გვაქვს ფაილები, უნდა შევამოწმოთ ლიმიტი
      if (imageFiles.length + selectedFiles.length > maxFiles) {
        setError(`შესაძლებელია მაქსიმუმ ${maxFiles} ფოტოს ატვირთვა`);
        return;
      }
      
      setImageFiles(prev => [...prev, ...selectedFiles]);
      
      // შევქმნათ previews ყველა ახალი ფაილისთვის
      selectedFiles.forEach(file => {
        const reader = new FileReader();
        reader.onload = () => {
          setImagePreviews(prev => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleRemoveImage = (index: number) => {
    setImageFiles(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleImageUpload = async (): Promise<string[] | null> => {
    if (imageFiles.length === 0) return null;
    
    try {
      setIsUploading(true);
      
      // შევქმნათ უნიკალური სახელები ფაილებისთვის
      const fileNames = imageFiles.map((file, index) => `products/${user?.id}/${Date.now()}_${index}_${file.name}`);
      const storageRefs = fileNames.map(fileName => ref(storage, fileName));
      
      // ავტვირთოთ ფაილები
      const uploadTasks = storageRefs.map(async (storageRef, index) => {
        await uploadBytes(storageRef, imageFiles[index]);
        const downloadUrl = await getDownloadURL(storageRef);
        return downloadUrl;
      });
      
      const downloadUrls = await Promise.all(uploadTasks);
      
      return downloadUrls;
    } catch (error) {
      console.error("Error uploading images:", error);
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  // ლინკის კანონიკური ფორმატის მიღება
  const getCanonicalLink = (link: string): string => {
    if (!link.trim()) return "";
    
    let normalizedLink = link.trim();
    // დარწმუნდი, რომ პროტოკოლი გვაქვს
    if (!normalizedLink.startsWith('http://') && !normalizedLink.startsWith('https://')) {
      normalizedLink = 'https://' + normalizedLink;
    }
    // მოვაშოროთ trailing slashes
    normalizedLink = normalizedLink.replace(/\/$/, "");
    
    return normalizedLink;
  };

  // მივამატოთ ლოგოს ჩვენება ფორმაში
  const ChannelLogoPreview = () => {
    if (!formData.channelLogo) return null;
    
    return (
      <div className="mt-4">
        <p className="text-sm text-gray-600 mb-2">არხის ლოგო:</p>
        <div className="relative w-16 h-16 rounded-full overflow-hidden border border-gray-200">
          <Image 
            src={formData.channelLogo} 
            alt="არხის ლოგო" 
            width={64} 
            height={64}
            className="object-cover w-full h-full"
          />
        </div>
      </div>
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // დაუყოვნებლივ დავაყენოთ მდგომარეობა, რომ ანიმაცია წამიერად დაიწყოს
    setIsSubmitting(true);
    setError(null);
    
    if (!user) {
      setError("You must be logged in to create a listing");
      setIsSubmitting(false);
      return;
    }

    if (!formData.accountLink || !isValidChannel) {
      setError("Please enter a valid channel link");
      setIsSubmitting(false);
      return;
    }
    
    // შევამოწმოთ არხი ატვირთვის წინ ხელახლა
    const channelExists = await checkIfChannelExists(formData.accountLink);
    if (channelExists || isChannelAlreadyUploaded) {
      setError("ეს არხი უკვე ატვირთულია სისტემაში. დუბლირება აკრძალულია.");
      setIsSubmitting(false);
      return;
    }

    // YouTube-სთვის აუცილებელია დამატებითი ინფორმაცია
    if (formData.platform === "YouTube" && (!formData.displayName || formData.subscribers <= 0)) {
      setError("Please fill in all required fields");
      setIsSubmitting(false);
      return;
    }

    // სხვა პლატფორმებისთვის საკმარისია ფასი და სახელი
    if (formData.price <= 0 || (formData.platform !== "YouTube" && !formData.displayName)) {
      setError("Please fill in all required fields");
      setIsSubmitting(false);
      return;
    }

    try {
      // ანიმაცია უკვე დაწყებულია, აქ აღარ არის საჭირო setIsSubmitting(true);

      // Upload images if selected
      let imageUrls = [...formData.imageUrls];
      if (imageFiles.length > 0) {
        const uploadedUrls = await handleImageUpload();
        if (uploadedUrls) {
          imageUrls = [...imageUrls, ...uploadedUrls];
        }
      }

      // Update description with dynamic values
      const updatedDescription = `${formData.description}

Monetization: ${formData.monetizationEnabled ? 'Enabled' : 'Disabled'}

Ways of promotion: ${formData.promotionStrategy || ''}

Sources of expense: ${formData.expenseDetails || ''}

Sources of income: ${formData.incomeSource || ''}

To support the channel, you need: ${formData.supportRequirements || ''}

Content: Unique content

$${formData.income} — income (month)

$${formData.expenses} — expense (month)`;

      // Add product to Firestore
      const productData = {
        userId: user.id,
        userEmail: user.email,
        createdAt: Date.now(),
        platform: formData.platform,
        accountLink: getCanonicalLink(formData.accountLink),
        displayName: formData.displayName,
        subscribers: formData.subscribers,
        category: formData.category,
        price: formData.price,
        allowComments: formData.allowComments,
        description: updatedDescription,
        monthlyIncome: formData.income,
        monthlyExpenses: formData.expenses,
        incomeSource: formData.incomeSource,
        expenseDetails: formData.expenseDetails,
        promotionStrategy: formData.promotionStrategy,
        supportRequirements: formData.supportRequirements,
        monetizationEnabled: formData.monetizationEnabled,
        imageUrls: imageUrls,
        verificationCode: uuidv4().substring(0, 8),
        channelLogo: formData.channelLogo || ""
      };

      const docRef = await addDoc(collection(db, "products"), productData);
      
      router.push(`/products/${docRef.id}`);
    } catch (err) {
      console.error("Error creating product:", err);
      setError("Failed to create product. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="text-center py-10 bg-blue-100 rounded-lg shadow-md border border-blue-200 text-blue-800">
        <h2 className="text-2xl font-bold mb-4">Please login to add a listing</h2>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto bg-white/90 rounded-lg shadow-lg p-6 border border-blue-200 text-blue-900">
      <h1 className="text-2xl font-bold mb-6">CREATE NEW LISTING</h1>

      {error && (
        <div className="bg-red-100 border border-red-300 text-red-800 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <select
            name="platform"
            value={formData.platform}
            onChange={handleChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {platforms.map((platform) => (
              <option key={platform} value={platform}>{platform}</option>
            ))}
          </select>
        </div>
        
        <div className="relative">
          <input
            type="url"
            name="accountLink"
            value={formData.accountLink}
            onChange={handleChange}
            placeholder="Channel Link"
            required
            className={`w-full px-3 py-2 border ${isChannelAlreadyUploaded ? 'border-red-500 bg-red-50' : 'border-gray-300'} rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400`}
          />
          {isLoading && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          )}
        </div>
        
        {isChannelAlreadyUploaded && (
          <div className="bg-red-100 border-2 border-red-400 text-red-700 px-4 py-3 rounded mb-4 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 mr-2 text-red-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <span className="font-bold">ეს არხი უკვე ატვირთულია! არხების დუბლირება აკრძალულია.</span>
          </div>
        )}
        
        {!isValidChannel && formData.platform === "YouTube" && (
          <div className="flex-1">
            <input
              type="number"
              name="price"
              value={formData.price === 0 ? "" : formData.price}
              onChange={handleChange}
              min="0"
              placeholder="Price ($)"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        )}
        
        {!isValidChannel && formData.platform !== "YouTube" && (
          <>
            <div className="flex space-x-2">
              <div className="flex-1">
                <input
                  type="text"
                  name="displayName"
                  value={formData.displayName}
                  onChange={handleChange}
                  placeholder="Channel Name"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div className="flex-1">
                <input
                  type="number"
                  name="subscribers"
                  value={formData.subscribers === 0 ? "" : formData.subscribers}
                  onChange={handleChange}
                  min="0"
                  placeholder="Subscribers"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>

            <div className="flex-1">
              <input
                type="number"
                name="price"
                value={formData.price === 0 ? "" : formData.price}
                onChange={handleChange}
                min="0"
                placeholder="Price ($)"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </>
        )}
        
        {isValidChannel && formData.platform === "YouTube" && (
          <>
            <div className="flex space-x-2">
              <div className="flex-1">
                <input
                  type="text"
                  name="displayName"
                  value={formData.displayName}
                  onChange={handleChange}
                  placeholder="Channel Name"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-100"
                  readOnly
                />
              </div>
              <div className="flex-1">
                <input
                  type="number"
                  name="subscribers"
                  value={formData.subscribers === 0 ? "" : formData.subscribers}
                  onChange={handleChange}
                  min="0"
                  placeholder="Subscribers"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-100"
                  readOnly
                />
              </div>
            </div>

            <div className="flex-1">
              <input
                type="number"
                name="price"
                value={formData.price === 0 ? "" : formData.price}
                onChange={handleChange}
                min="0"
                placeholder="Price ($)"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </>
        )}
        
        {isValidChannel && formData.platform !== "YouTube" && (
          <>
            <div className="flex space-x-2">
              <div className="flex-1">
                <input
                  type="text"
                  name="displayName"
                  value={formData.displayName}
                  onChange={handleChange}
                  placeholder="Channel Name"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div className="flex-1">
                <input
                  type="number"
                  name="subscribers"
                  value={formData.subscribers === 0 ? "" : formData.subscribers}
                  onChange={handleChange}
                  min="0"
                  placeholder="Subscribers"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>

            <div className="flex-1">
              <input
                type="number"
                name="price"
                value={formData.price === 0 ? "" : formData.price}
                onChange={handleChange}
                min="0"
                placeholder="Price ($)"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </>
        )}

        <div>
          <select
            name="category"
            value={formData.category}
            onChange={handleChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">— Select Category —</option>
            <option value="Entertainment">Entertainment</option>
            <option value="Gaming">Gaming</option>
            <option value="Education">Education</option>
            <option value="Technology">Technology</option>
            <option value="Business">Business</option>
            <option value="Lifestyle">Lifestyle</option>
            <option value="Travel">Travel</option>
            <option value="Sports">Sports</option>
            <option value="Food">Food</option>
            <option value="Fashion">Fashion</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <div className="flex-1 flex items-center justify-end">
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              name="allowComments"
              checked={formData.allowComments}
              onChange={handleChange}
              className="sr-only peer"
            />
            <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-400 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            <span className="ms-3">Allow comments</span>
          </label>
        </div>

        <div>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder="Description"
            rows={5}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <p className="text-sm text-gray-500 mt-1">Enter your channel description here.</p>
        </div>

        <div>
          <select
            name="monetizationEnabled"
            value={formData.monetizationEnabled ? "true" : "false"}
            onChange={(e) => setFormData({...formData, monetizationEnabled: e.target.value === "true"})}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">— Monetization status —</option>
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
        </div>

        <div>
          <input
            type="text"
            name="promotionStrategy"
            value={formData.promotionStrategy}
            onChange={handleChange}
            placeholder="Ways of promotion"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div>
          <input
            type="text"
            name="expenseDetails"
            value={formData.expenseDetails}
            onChange={handleChange}
            placeholder="Sources of expense"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div>
          <input
            type="text"
            name="incomeSource"
            value={formData.incomeSource}
            onChange={handleChange}
            placeholder="Sources of income"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div>
          <input
            type="text"
            name="supportRequirements"
            value={formData.supportRequirements}
            onChange={handleChange}
            placeholder="To support the channel, you need"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <input
              type="number"
              name="income"
              value={formData.income === 0 ? "" : formData.income}
              onChange={handleChange}
              min="0"
              placeholder="Income"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          
          <div>
            <input
              type="number"
              name="expenses"
              value={formData.expenses === 0 ? "" : formData.expenses}
              onChange={handleChange}
              min="0"
              placeholder="Expenses ($/month)"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        </div>

        <div className="mt-6 border-t border-gray-200 pt-6">
          <h3 className="text-lg font-medium mb-2">Channel Photos (max 6)</h3>
          
          {/* ატვირთული ფოტოების გამოსახულება */}
          <div className="flex flex-wrap gap-4 mb-4">
            {imagePreviews.map((preview, index) => (
              <div key={index} className="relative w-32 h-32 border rounded-lg overflow-hidden">
                <Image 
                  src={preview} 
                  alt={`Preview ${index + 1}`} 
                  fill
                  className="object-cover"
                />
                <button 
                  type="button"
                  onClick={() => handleRemoveImage(index)}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            
            {/* ატვირთვის ღილაკი */}
            {imagePreviews.length < 6 && (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="w-32 h-32 border-2 border-dashed border-blue-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-blue-50 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-blue-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <span className="mt-2 text-sm text-blue-500">Add Photo</span>
              </div>
            )}
          </div>
          
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleImageChange} 
            className="hidden" 
            accept="image/*"
            multiple
          />
          
          <div className="mt-3 bg-blue-50 p-3 rounded-lg text-sm text-blue-700 border border-blue-100">
            <p className="flex items-start">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-1 flex-shrink-0 text-blue-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
              <span>
                <strong>Recommendation:</strong> Upload high-quality, square format photos (max 2MB). Preferably channel logos or thematic images that will attract user attention.
              </span>
            </p>
          </div>
        </div>

        <div className="mt-6 border-t border-gray-200 pt-6">
          <h3 className="text-lg font-medium mb-2">Channel Logo</h3>
          <ChannelLogoPreview />
        </div>

        <div className="flex justify-center pt-4">
          <button
            type="submit"
            disabled={isSubmitting || isUploading}
            className="px-6 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 disabled:opacity-50 transition-colors flex items-center justify-center min-w-[180px]"
          >
            {isSubmitting || isUploading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                დამუშავება...
              </>
            ) : (
              "Create Listing"
            )}
          </button>
        </div>
      </form>
    </div>
  );
} 