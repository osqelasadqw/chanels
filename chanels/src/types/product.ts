export interface Product {
  id: string;
  userId: string;
  userEmail: string;
  createdAt: number;
  platform: string;
  category: string;
  accountLink: string;
  displayName: string;
  price: number;
  subscribers: number;
  allowComments: boolean;
  description: string;
  monthlyIncome: number;
  monthlyExpenses: number;
  incomeSource: string;
  expenseDetails: string;
  promotionStrategy: string;
  supportRequirements: string;
  imageUrls: string[];
  verificationCode: string;
  income?: number;
  monetization?: boolean;
  channelLogo?: string;
}

export interface ProductFormData {
  platform: string;
  category: string;
  accountLink: string;
  displayName: string;
  price: number;
  subscribers: number;
  allowComments: boolean;
  description: string;
  monthlyIncome: number;
  monthlyExpenses: number;
  incomeSource: string;
  expenseDetails: string;
  promotionStrategy: string;
  supportRequirements: string;
  images: File[];
  verificationCode: string;
  channelLogo?: string;
} 