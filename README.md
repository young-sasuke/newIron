# IronXpress Admin Dashboard

A modern, real-time admin dashboard for managing IronXpress orders, built with Next.js 15, Supabase, and Tailwind CSS.

## ✨ Features

- **Real-time Order Management**: Live notifications when new orders come in
- **Accept/Reject Orders**: Toggle between accept and reject for pending orders  
- **Responsive Design**: Works perfectly on desktop, tablet, and mobile
- **Secure Authentication**: Admin-only access with email verification
- **Modern UI**: Clean, professional design with smooth animations
- **Real-time Updates**: Live data synchronization with Supabase
- **Order Details**: View complete order information including items and customer details

## 🚀 Tech Stack

- **Framework**: Next.js 15 with App Router
- **Database**: Supabase (PostgreSQL with real-time subscriptions)
- **Authentication**: Supabase Auth
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Notifications**: React Toastify
- **Deployment**: Vercel (optimized for production)

## 📦 Installation

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up environment variables**
   Your `.env.local` is already configured with:
   ```env
   # Supabase Configuration
   NEXT_PUBLIC_SUPABASE_URL=https://qehtgclgjhzdlqcjujpp.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

   # Admin Configuration (comma-separated emails)
   NEXT_PUBLIC_ADMIN_EMAILS=mannu667@gmail.com,hardikitech04@gmail.com
   ```

3. **Set up Supabase Database**
   Create the following table in your Supabase database:
   ```sql
   CREATE TABLE orders (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     customer_name VARCHAR NOT NULL,
     customer_email VARCHAR NOT NULL,
     customer_phone VARCHAR NOT NULL,
     items JSONB NOT NULL DEFAULT '[]',
     total_amount DECIMAL(10,2) NOT NULL,
     status VARCHAR DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'completed', 'cancelled')),
     delivery_address TEXT NOT NULL,
     notes TEXT,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
     updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
   );

   -- Enable RLS (Row Level Security)
   ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

   -- Create policy for authenticated users to read all orders
   CREATE POLICY "Allow authenticated users to read orders" ON orders
     FOR SELECT USING (auth.role() = 'authenticated');

   -- Create policy for authenticated users to update orders
   CREATE POLICY "Allow authenticated users to update orders" ON orders
     FOR UPDATE USING (auth.role() = 'authenticated');

   -- Enable real-time subscriptions
   ALTER PUBLICATION supabase_realtime ADD TABLE orders;
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open the application**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 🌐 Deployment to Vercel

### Prerequisites
- A Vercel account
- Your custom domain (optional)

### Deployment Steps

1. **Connect to Vercel**
   ```bash
   # Install Vercel CLI (if not already installed)
   npm i -g vercel

   # Login to Vercel
   vercel login

   # Deploy
   vercel
   ```

2. **Set Environment Variables in Vercel**
   Go to your Vercel dashboard → Project → Settings → Environment Variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL = https://qehtgclgjhzdlqcjujpp.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = your_supabase_anon_key
   NEXT_PUBLIC_ADMIN_EMAILS = mannu667@gmail.com,hardikitech04@gmail.com
   NODE_ENV = production
   NEXT_PUBLIC_APP_NAME = IronXpress Admin
   NEXT_PUBLIC_APP_VERSION = 1.0.0
   ```

3. **Custom Domain Setup**
   - Go to Vercel Dashboard → Your Project → Settings → Domains
   - Add your custom domain (e.g., `admin.ironxpress.com`)
   - Configure DNS records as instructed by Vercel

4. **Production Build**
   ```bash
   # Build and deploy
   vercel --prod
   ```

## 📊 Order Flow

1. **Customer places order** on your main IronXpress app/website
2. **Order is inserted** into the Supabase `orders` table with status `pending`
3. **Real-time notification** appears in the admin dashboard
4. **Admin can view** order details and customer information
5. **Admin clicks Accept/Reject** to update order status
6. **Status updates** are reflected in real-time
7. **Notifications** confirm the action

## 🏗️ Project Structure

```
ironxpress-admin/
├── app/
│   ├── admin/              # Admin routes
│   │   ├── dashboard/      # Main dashboard
│   │   ├── orders/         # Order management
│   │   ├── products/       # Product management
│   │   ├── users/          # User management
│   │   ├── analytics/      # Analytics page
│   │   └── settings/       # Settings page
│   ├── admin-layout/       # Admin authentication wrapper
│   ├── login/              # Login page
│   ├── layout.tsx          # Root layout
│   └── globals.css         # Global styles
├── components/
│   ├── AdminLayout.tsx     # Main admin layout
│   ├── Sidebar.tsx         # Navigation sidebar
│   └── ui/                 # UI components
├── lib/
│   ├── supabase.ts         # Supabase client
│   ├── admin.ts            # Admin utilities
│   └── utils.ts            # General utilities
└── public/                 # Static assets
```

## 🔒 Security Features

- **Admin-only access** with email verification
- **Row Level Security** enabled on Supabase
- **Secure headers** configured in Next.js
- **Environment variables** for sensitive data
- **No sensitive data** exposed to client-side

## 📱 Responsive Design

The dashboard is fully responsive and works on:
- **Desktop** (1200px+)
- **Tablet** (768px - 1199px)  
- **Mobile** (320px - 767px)

## 🚨 Troubleshooting

### Common Issues

1. **Environment Variables Not Working**
   - Ensure variables start with `NEXT_PUBLIC_` for client-side access
   - Restart development server after adding new variables

2. **Real-time Updates Not Working**
   - Check Supabase RLS policies
   - Verify real-time is enabled for the orders table
   - Check browser console for WebSocket errors

3. **Admin Authentication Issues**
   - Verify admin emails are correctly formatted in environment variables
   - Check Supabase Auth dashboard for user accounts

## 📞 Admin Access

**Login Credentials:**
- Email: mannu667@gmail.com or hardikitech04@gmail.com
- Password: (Set up in Supabase Auth)

---

**Built with ❤️ for IronXpress**
