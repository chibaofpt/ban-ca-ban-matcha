"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/src/lib/store/authStore";
import { useAuthModalStore } from "@/src/lib/store/authModalStore";
import {
  checkPhone,
  register as registerRequest,
  type RegisterPayload,
} from "@/src/services/authService";
import { resetForceLogout } from "@/src/lib/api/client";
import RegisterStepOne, {
  type RegisterStepOneValues,
} from "@/src/components/common/register/RegisterStepOne";
import RegisterStepTwo, {
  type RegisterStepTwoValues,
} from "@/src/components/common/register/RegisterStepTwo";

/** Two-step customer registration wizard with optional Instagram alias. */
const RegisterForm = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [stepOne, setStepOne] = useState<RegisterStepOneValues | null>(null);
  const login = useAuthStore((state) => state.login);
  const close = useAuthModalStore((state) => state.close);
  const switchTo = useAuthModalStore((state) => state.switchTo);

  const continueFromStepOne = async (
    values: RegisterStepOneValues,
  ): Promise<void> => {
    const result = await checkPhone(values.phone_number);
    if (result.exists) {
      throw new Error(
        "Số điện thoại này đã được đăng ký. Vui lòng đăng nhập.",
      );
    }
    setStepOne(values);
    setStep(2);
  };

  const completeRegistration = async (
    values: RegisterStepTwoValues,
  ): Promise<void> => {
    if (!stepOne) return;
    const payload: RegisterPayload = {
      name: values.name,
      phone_number: stepOne.phone_number,
      password: stepOne.password,
      ...(values.insta_name ? { insta_name: values.insta_name } : {}),
    };
    const user = await registerRequest(payload);
    queryClient.removeQueries({ queryKey: ["customer"] });

    const from = new URLSearchParams(window.location.search).get("from");
    router.push(from || "/menu");
    router.refresh();
    login(user.phone_number, user.name);
    resetForceLogout();
    close();
  };

  return (
    <div className="space-y-5">
      {step === 1 ? (
        <RegisterStepOne
          onContinue={continueFromStepOne}
          onLogin={() => switchTo("login")}
        />
      ) : (
        <RegisterStepTwo
          onBack={() => setStep(1)}
          onSubmit={completeRegistration}
          onLogin={() => switchTo("login")}
        />
      )}
    </div>
  );
};

export default RegisterForm;
