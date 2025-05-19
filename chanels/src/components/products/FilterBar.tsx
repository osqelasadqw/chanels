"use client";

import { useState } from "react";

export interface FilterOptions {
  platform?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  minSubscribers?: number;
  maxSubscribers?: number;
  minIncome?: number;
  maxIncome?: number;
  monetization?: boolean;
  search?: string;
}

interface FilterBarProps {
  onFilterChange: (filters: FilterOptions) => void;
}

const platforms = ["YouTube", "TikTok", "Twitter", "Instagram", "Facebook", "Telegram"];
const categories = [
  "Entertainment",
  "Gaming",
  "Education",
  "Technology",
  "Business",
  "Lifestyle",
  "Travel",
  "Sports",
  "Food",
  "Fashion",
  "Other"
];

export default function FilterBar({ onFilterChange }: FilterBarProps) {
  const [filters, setFilters] = useState<FilterOptions>({});

  const handleFilterChange = (key: keyof FilterOptions, value: string | number | boolean | undefined) => {
    const newFilters = { ...filters, [key]: value };
    
    // If value is empty string or 0, remove the filter
    if (value === "" || value === 0) {
      delete newFilters[key];
    }
    
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  return (
    <div className="bg-[#13131a] rounded-lg p-8 mb-6 max-w-3xl mx-auto shadow-lg">
      <div className="text-center mb-4">
        {/* Platform Buttons */}
        <div className="flex flex-wrap justify-center gap-2 mb-6">
          {platforms.map((platform) => (
            <button
              key={platform}
              onClick={() => handleFilterChange("platform", filters.platform === platform ? undefined : platform)}
              className={`px-4 py-2 rounded-full border ${
                filters.platform === platform
                  ? "bg-white text-black border-white"
                  : "bg-transparent text-white border-gray-500 hover:border-white"
              }`}
            >
              {platform}
            </button>
          ))}
        </div>
        
        {/* Search Input */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search by name"
            className="w-full max-w-xl px-4 py-2 rounded-md border border-gray-300 focus:outline-none"
            value={filters.search || ""}
            onChange={(e) => handleFilterChange("search", e.target.value)}
          />
        </div>

        {/* Category and Monetization */}
        <div className="flex flex-col md:flex-row gap-4 mb-6 justify-center">
          <select
            className="px-3 py-2 rounded-md border border-gray-300 focus:outline-none"
            value={filters.category || ""}
            onChange={(e) => handleFilterChange("category", e.target.value)}
          >
            <option value="">Select category</option>
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          
          <button
            onClick={() => handleFilterChange("monetization", !filters.monetization)}
            className={`px-4 py-2 rounded-md ${
              filters.monetization
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-white"
            }`}
          >
            Monetization enabled
          </button>
        </div>

        {/* Filter Ranges */}
        <div className="grid grid-cols-1 gap-2 text-left max-w-xs mx-auto">
          {/* Subscribers Range */}
          <div className="text-white">
            <label className="block mb-1">Subscribers:</label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                placeholder="from"
                className="w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none"
                value={filters.minSubscribers || ""}
                onChange={(e) => handleFilterChange("minSubscribers", e.target.value ? Number(e.target.value) : undefined)}
              />
              <span>—</span>
              <input
                type="text"
                placeholder="to"
                className="w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none"
                value={filters.maxSubscribers || ""}
                onChange={(e) => handleFilterChange("maxSubscribers", e.target.value ? Number(e.target.value) : undefined)}
              />
            </div>
          </div>

          {/* Price Range */}
          <div className="text-white">
            <label className="block mb-1">Price:</label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                placeholder="from"
                className="w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none"
                value={filters.minPrice || ""}
                onChange={(e) => handleFilterChange("minPrice", e.target.value ? Number(e.target.value) : undefined)}
              />
              <span>—</span>
              <input
                type="text"
                placeholder="to"
                className="w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none"
                value={filters.maxPrice || ""}
                onChange={(e) => handleFilterChange("maxPrice", e.target.value ? Number(e.target.value) : undefined)}
              />
            </div>
          </div>

          {/* Income Range */}
          <div className="text-white">
            <label className="block mb-1">Income:</label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                placeholder="from"
                className="w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none"
                value={filters.minIncome || ""}
                onChange={(e) => handleFilterChange("minIncome", e.target.value ? Number(e.target.value) : undefined)}
              />
              <span>—</span>
              <input
                type="text"
                placeholder="to"
                className="w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none"
                value={filters.maxIncome || ""}
                onChange={(e) => handleFilterChange("maxIncome", e.target.value ? Number(e.target.value) : undefined)}
              />
            </div>
          </div>
        </div>

        {/* Search Button */}
        <div className="mt-4">
          <button 
            className="px-10 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition duration-200"
            onClick={() => onFilterChange(filters)}
          >
            Search
          </button>
        </div>
      </div>
    </div>
  );
} 