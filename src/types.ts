export interface Organizer {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  contact: string;
  website: string | null;
  social_url: string | null;
  logo_path: string | null;
  approval: string;
  verified: boolean;
  suspended: boolean;
  average_rating: number | null;
  review_count: number;
  event_count?: number;
}
export interface Event {
  transport_status: "unknown" | "available" | "unavailable";
  transport_details: string;
  transport_url: string | null;
  id: string;
  organizer_id: string;
  name: string;
  description: string;
  category_id: number;
  division_id: number;
  district_id: number;
  starts_at: string;
  ends_at: string;
  registration_deadline: string;
  venue: string;
  address: string;
  map_url: string | null;
  cover_path: string | null;
  contact: string;
  price: number;
  registration_url: string | null;
  approval: string;
  cancelled: boolean;
  organizer_name: string;
  organizer_verified: boolean;
  average_rating: number | null;
  review_count: number;
  division_name: string;
  district_name: string;
  category_name: string;
  status: string;
  popularity: number;
}
export interface Review {
  id: string;
  event_id: string;
  user_id: string;
  organizer_id: string;
  score: number;
  body: string;
  author_name: string;
  reply: string | null;
  moderation: string;
  created_at: string;
}
export interface Reference {
  id: number;
  name: string;
  division_id?: number;
}
export interface Profile {
  id: string;
  display_name: string;
  suspended: boolean;
}
export interface Registration {
  id: string;
  event_id: string;
  user_id: string;
  status: string;
  created_at: string;
}
