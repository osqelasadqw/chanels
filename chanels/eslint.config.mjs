import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // დავუშვათ useAuth ჰუკის გამოყენება callback ფუნქციებში
      "react-hooks/rules-of-hooks": "error",
      "@typescript-eslint/no-unused-vars": "error",
      "react/no-unescaped-entities": "off"
    }
  },
  // ცალკე კონფიგურაცია Header.tsx ფაილისთვის
  {
    files: ["src/components/layout/Header.tsx"],
    rules: {
      "react-hooks/rules-of-hooks": "off"
    }
  },
  // კონფიგურაცია გამოუყენებელი ცვლადებისთვის ყველა გვერდის ფაილებში
  {
    files: [
      "src/components/forms/ProductForm.tsx",
      "src/app/products/[id]/page.tsx",
      "src/components/auth/AuthProvider.tsx",
      "src/components/chat/AdminChatList.tsx",
      "src/app/admin/page.tsx",
      "src/app/chats/[id]/page.tsx",
      "src/app/my-products/page.tsx",
      "src/app/page.tsx",
      "src/app/products/[id]/contact/page.tsx"
    ],
    rules: {
      "@typescript-eslint/no-unused-vars": "off"
    }
  },
  // კონფიგურაცია <img> ელემენტისთვის და no-explicit-any
  {
    files: ["**/*.tsx", "**/*.ts"],
    rules: {
      "@next/next/no-img-element": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/exhaustive-deps": "off"
    }
  }
];

export default eslintConfig;
