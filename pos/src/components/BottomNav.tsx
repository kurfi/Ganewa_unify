import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, ShoppingCart, Package, Users, Receipt, PieChart, RotateCcw, Building, Truck, MoreHorizontal } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { UserRole } from '../types';

export const BottomNav: React.FC = () => {
    const location = useLocation();
    const { currentUser } = useAuth();

    const navItems = [
        { name: 'Home', path: '/', icon: LayoutDashboard, roles: [UserRole.ADMIN, UserRole.CASHIER, UserRole.SUPER_ADMIN] },
        { name: 'POS', path: '/pos', icon: ShoppingCart, roles: [UserRole.ADMIN, UserRole.CASHIER, UserRole.SUPER_ADMIN] },
        { name: 'Inventory', path: '/inventory', icon: Package, roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN] },
        { name: 'Customers', path: '/customers', icon: Users, roles: [UserRole.ADMIN, UserRole.CASHIER, UserRole.SUPER_ADMIN] },
        { name: 'More', path: '/settings', icon: MoreHorizontal, roles: [UserRole.ADMIN, UserRole.CASHIER, UserRole.SUPER_ADMIN] },
    ];

    const availableNavItems = navItems.filter(item => currentUser && item.roles.includes(currentUser.role));

    return (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-2 py-1 z-50 md:hidden flex justify-around items-center h-16 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
            {availableNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                    <Link
                        key={item.path}
                        to={item.path}
                        className={`flex flex-col items-center justify-center flex-1 h-full py-1 rounded-lg transition-all duration-200 ${isActive
                            ? 'text-emerald-600'
                            : 'text-slate-500 active:text-slate-800'
                            }`}
                    >
                        <div className={`p-1.5 rounded-xl transition-colors ${isActive ? 'bg-emerald-50' : 'bg-transparent'}`}>
                            <Icon className={`w-6 h-6 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-tighter mt-0.5">{item.name}</span>
                    </Link>
                );
            })}
        </nav>
    );
};

export default BottomNav;
