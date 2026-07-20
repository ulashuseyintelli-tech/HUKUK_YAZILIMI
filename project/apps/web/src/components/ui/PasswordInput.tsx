"use client";

import { forwardRef, useId, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Toggle "göster" durumundaki aria-label; "gizle" durumu sabittir. */
  showLabel?: string;
};

/**
 * OFFICE-AUTH-P01: tekrar kullanılabilir şifre input'u. Yalnız görünürlük
 * (type="password"/"text") ve odak durumunu yönetir; value/onChange/name/
 * autoComplete gibi tüm standart input davranışları olduğu gibi forward edilir.
 * Şifre değeri hiçbir şekilde loglanmaz, URL'ye veya başka bir yere gönderilmez.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ showLabel, className, ...props }, ref) => {
    const [visible, setVisible] = useState(false);
    const reactId = useId();

    return (
      <div className="relative">
        <input
          {...props}
          ref={ref}
          id={props.id ?? reactId}
          type={visible ? "text" : "password"}
          className={className ? `${className} pr-10` : "pr-10"}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Şifreyi gizle" : (showLabel ?? "Şifreyi göster")}
          aria-pressed={visible}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary rounded"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";
