import {
  parseReviewThemes,
  validateReviewThemes,
} from "@/lib/reviewThemes";

type BusinessDetailsInput = {
  name?: string;
  address?: string;
  category?: string;
  description?: string;
  reviewThemes?: string | string[];
  googlePlaceId?: string;
};

export function validateBusinessDetails(input: BusinessDetailsInput): string | null {
  if (!input.name?.trim()) return "Business name is required";
  if (!input.address?.trim()) return "Address is required";
  if (!input.category?.trim()) return "Category is required";
  if (!input.description?.trim()) return "Business description is required";

  const themes = parseReviewThemes(input.reviewThemes);
  const themesError = validateReviewThemes(themes);
  if (themesError) return themesError;

  if (!input.googlePlaceId?.trim()) return "Google Place ID is required";
  return null;
}

export function normalizeBusinessDetails(input: BusinessDetailsInput) {
  const themes = parseReviewThemes(input.reviewThemes);
  return {
    name: input.name!.trim(),
    address: input.address!.trim(),
    category: input.category!.trim(),
    description: input.description!.trim(),
    reviewThemes: themes,
    googlePlaceId: input.googlePlaceId!.trim(),
  };
}
