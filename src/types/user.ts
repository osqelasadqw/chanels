export interface User {
  id: string;
  name: string;
  email: string;
  photoURL?: string;
  adminPhotoURL?: string;
  isAdmin: boolean;
}

export interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
} 