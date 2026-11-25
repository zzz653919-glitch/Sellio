import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "Password must contain at least one letter and one number");

const name = (label: string) =>
  z.string().trim().min(1, `${label} is required`).max(60, `${label} is too long`);

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")).pipe(z.string().max(254));

export const signupSchema = z.object({
  firstName: name("First name"),
  lastName: name("Last name"),
  email: emailSchema,
  password: passwordSchema,
  /** The language chosen on the sign-up page becomes the account's saved language. */
  language: z.enum(["en", "uz", "ru"]).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required").max(128),
});

const challenge = z.string().min(20, "Invalid sign-in attempt").max(100, "Invalid sign-in attempt");
export const challengeSchema = z.object({ challenge });
export const verifyCodeSchema = z.object({
  challenge,
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from the email"),
});
export const forgotSchema = z.object({ email: emailSchema });
export const resetSchema = z.object({ token: z.string().min(20).max(100), password: passwordSchema });
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});
