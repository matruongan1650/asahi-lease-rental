import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import OrderBus from "../lib/orderBus";
import { PRODUCTS } from "../data/products";
import { isVehicleCategory } from "../utils/productUtils";
import { VEHICLES as initialVehicles } from "../data/adminMockData";

export interface VehicleAlert {
  id: number;
  type: "danger" | "warning";
  title: string;
  subtitle: string;
  icon: string;
}

export interface VehicleFile {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
  dataUrl: string;
}

export interface VehicleDetail {
  id: string; // The product id
  productId: string;
  name: string;
  stock?: number;
  plate: string;
  category: string;
  status: "使用中" | "空車" | "整備中";
  statusColor: "emerald" | "orange" | "blue";
  
  // Legal
  inspectionDate: string; // "2026/06/08"
  inspectionDaysRemaining: number;
  insuranceDate: string;
  
  // Basic Info
  manufacturer: string;
  year: string;
  color: string;
  vin: string; // Vehicle Identification Number
  engineModel: string;
  purchaseDate: string;
  purchasePrice: string;
  mileage: string;
  
  maintenanceDesc: string;
  maintenanceDate: string;
  
  alerts: VehicleAlert[];
  
  maintenanceHistory: { date: string; item: string; mileage: string }[];
  repairHistory: { title: string; shop: string; date: string; price: string; receipt: string }[];
  documents: string[];
  vehicleFiles?: VehicleFile[];
  photos?: string[];
}

interface VehicleContextType {
  vehicles: VehicleDetail[];
  updateVehicle: (id: string, updates: Partial<VehicleDetail>) => void;
  addVehicle: (vehicle: VehicleDetail) => void;
  deleteVehicle: (id: string) => void;
}

const VehicleContext = createContext<VehicleContextType | undefined>(undefined);

export function VehicleProvider({ children }: { children: ReactNode }) {
  const [vehicles, setVehicles] = useState<VehicleDetail[]>([]);

  useEffect(() => {
    const unsub = OrderBus.subscribe("vehicles", (data) => {
      setVehicles(data as unknown as VehicleDetail[]);
    });

    // 車両マスタ（保安車両）を seed する。
    // admin「商品管理 => 保安車両」と顧客側の双方で表示できるようにする。
    if (OrderBus.getAll("vehicles").length === 0) {
      OrderBus.seedIfEmpty("vehicles", initialVehicles as any);
    }

    return () => unsub();
  }, []);

  const updateVehicle = (id: string, updates: Partial<VehicleDetail>) => {
    OrderBus.patch("vehicles", id, updates);
  };

  const addVehicle = (vehicle: VehicleDetail) => {
    OrderBus.push("vehicles", vehicle as any);
  };

  const deleteVehicle = (id: string) => {
    OrderBus.remove("vehicles", id);
  };

  return (
    <VehicleContext.Provider value={{ vehicles, updateVehicle, addVehicle, deleteVehicle }}>
      {children}
    </VehicleContext.Provider>
  );
}

export function useVehicles() {
  const context = useContext(VehicleContext);
  if (context === undefined) {
    throw new Error("useVehicles must be used within a VehicleProvider");
  }
  return context;
}
