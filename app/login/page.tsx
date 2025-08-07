"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import { checkCurrentUserIsAdmin } from "@/lib/admin";
import { ArrowRight, Shield, AlertCircle } from 'lucide-react';
import { FcGoogle } from 'react-icons/fc';

export default function LoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    checkExistingAuth();
    handleUrlErrors();
  }, []);

  function handleUrlErrors() {
    const errorParam = searchParams.get('error');
    if (errorParam) {
      switch (errorParam) {
        case 'auth_failed':
          setError('Authentication failed. Please try again.');
          break;
        case 'no_session':
          setError('No session found. Please sign in again.');
          break;
        case 'not_admin':
          setError('Access denied. You need admin privileges to access this dashboard.');
          break;
        case 'callback_failed':
          setError('Authentication callback failed. Please try again.');
          break;
        default:
          setError('An error occurred during authentication.');
      }
    }
  }

  async function checkExistingAuth() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        // Check if user is admin
        const isAdmin = await checkCurrentUserIsAdmin();
        if (isAdmin) {
          router.replace('/admin/dashboard');
          return;
        } else {
          // User is logged in but not admin, sign them out
          await supabase.auth.signOut();
          setError('Access denied. You need admin privileges to access this dashboard.');
        }
      }
    } catch (err) {
      console.error('Error checking auth:', err);
    } finally {
      setCheckingAuth(false);
    }
  }

  async function handleGoogleLogin() {
    setLoading(true);
    setError("");
    
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`
        }
      });
      
      if (error) {
        setError(error.message);
      }
    } catch (err) {
      setError("Failed to initiate Google login. Please try again.");
      console.error('Google login error:', err);
    } finally {
      setLoading(false);
    }
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="text-gray-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50">
      <div className="max-w-md w-full space-y-8 p-8">
        {/* Header */}
        <div className="text-center">
          <div className="w-20 h-20 bg-blue-700 rounded-xl mx-auto flex items-center justify-center mb-4">
            <span className="text-white font-bold text-2xl">IX</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">IronXpress Admin</h1>
          <p className="text-gray-600 mt-2">Sign in with your Google account</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-xl shadow-lg p-8 border">
          <div className="space-y-6">
            {/* Admin Notice */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-amber-600" />
                <span className="text-sm font-medium text-amber-800">
                  Admin Access Required
                </span>
              </div>
              <p className="text-sm text-amber-700 mt-1">
                Only users with admin role can access this dashboard
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <span className="text-sm font-medium text-red-800">Access Denied</span>
                </div>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            )}

            {/* Google Login Button */}
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border-2 border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 hover:border-gray-400 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-600"></div>
                  Signing in with Google...
                </>
              ) : (
                <>
                  <FcGoogle className="h-5 w-5" />
                  Continue with Google
                </>
              )}
            </button>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Secure Admin Access</span>
              </div>
            </div>

            {/* Info */}
            <div className="text-center text-sm text-gray-500">
              <p>Your Google account must have admin privileges</p>
              <p className="mt-1">Contact your administrator if you need access</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-gray-500">
          <p>Authorized personnel only</p>
          <p className="mt-1">© 2024 IronXpress. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
