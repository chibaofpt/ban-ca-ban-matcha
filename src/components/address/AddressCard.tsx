import React from "react";
import type { Address } from "@/src/lib/types/address";
import { MapPin, User, Phone, CheckCircle2, MoreVertical, Edit2, Trash2 } from "lucide-react";
import { calcShippingFee } from "@/src/utils/pricing";

interface Props {
  address: Address;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  isSelectable?: boolean;
  onSelect?: () => void;
  isSelected?: boolean;
}

export function AddressCard({
  address,
  onEdit,
  onDelete,
  onSetDefault,
  isSelectable = false,
  onSelect,
  isSelected = false,
}: Props) {
  const [showMenu, setShowMenu] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div
      className={`relative bg-white rounded-2xl border transition-all ${
        isSelected
          ? "border-green-500 shadow-sm ring-1 ring-green-500"
          : isSelectable
          ? "border-gray-200 hover:border-green-400 hover:shadow-md cursor-pointer"
          : "border-gray-200"
      } p-4 md:p-5`}
      onClick={() => {
        if (isSelectable && onSelect) onSelect();
      }}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <div className="bg-green-100 p-2 rounded-full text-green-600 shrink-0">
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900">{address.label}</h3>
              {address.is_default && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-700 bg-green-100 px-1.5 py-0.5 rounded mt-0.5">
                  <CheckCircle2 className="h-2.5 w-2.5" /> Mặc định
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600 mt-0.5 line-clamp-1">
              {address.full_address}
            </p>
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
              {address.distance_km !== null ? (
                <>
                  <span>Cách cửa hàng {address.distance_km.toFixed(1)}km</span>
                  <span className="text-[10px]">•</span>
                  <span className="font-medium text-orange-600">
                    Phí ship {(calcShippingFee(address.distance_km) / 1000).toLocaleString("vi-VN")}k
                  </span>
                </>
              ) : (
                "Chưa có thông tin khoảng cách"
              )}
            </p>
          </div>
        </div>

        {/* Dropdown Menu */}
        {!isSelectable && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <MoreVertical className="h-5 w-5" />
            </button>

            {showMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-10">
                {!address.is_default && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                      onSetDefault();
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-green-50 hover:text-green-600 flex items-center gap-2"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Đặt làm mặc định
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onEdit();
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <Edit2 className="h-4 w-4" /> Chỉnh sửa
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onDelete();
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" /> Xóa địa chỉ
                </button>
              </div>
            )}
          </div>
        )}
        
        {/* Selection Checkmark */}
        {isSelectable && isSelected && (
          <div className="text-green-600">
            <CheckCircle2 className="h-6 w-6" />
          </div>
        )}
      </div>

      <div className="space-y-2 mt-4 pt-4 border-t border-gray-50">
        <div className="flex items-center text-sm text-gray-600">
          <User className="h-4 w-4 mr-2 text-gray-400" />
          <span className="font-medium text-gray-800">{address.receiver_name}</span>
        </div>
        <div className="flex items-center text-sm text-gray-600">
          <Phone className="h-4 w-4 mr-2 text-gray-400" />
          {address.receiver_phone}
        </div>
      </div>
    </div>
  );
}
