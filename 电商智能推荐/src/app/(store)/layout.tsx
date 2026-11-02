import { featuredProducts } from "@/lib/data/catalog";
import { Header } from "@/components/storefront/Header";
import { Footer } from "@/components/storefront/Footer";
import { CartDrawer } from "@/components/storefront/CartDrawer";
import { MobileTabBar } from "@/components/storefront/MobileTabBar";
import { CartProvider } from "@/components/providers/Cart";
import { WishlistProvider } from "@/components/providers/Wishlist";
import { currentCustomer, toCustomerView } from "@/lib/customer-auth";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const customer = await currentCustomer();
  return (
    <WishlistProvider>
      <CartProvider>
        <Header
          featured={featuredProducts}
          customer={customer ? toCustomerView(customer) : null}
        />
        <main id="main">{children}</main>
        <Footer />
        <CartDrawer />
        <MobileTabBar />
      </CartProvider>
    </WishlistProvider>
  );
}
