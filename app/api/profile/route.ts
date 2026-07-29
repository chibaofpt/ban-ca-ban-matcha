import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isUniqueConstraintError } from "@/lib/prisma-errors";
import { UpdateProfileSchema } from "@/lib/validations/profile";

const profileSelect = {
  name: true,
  phone_number: true,
  insta_name: true,
  points_balance: true,
  qr_token: true,
} as const;

function publicProfile(profile: {
  name: string;
  phone_number: string;
  insta_name: string | null;
  points_balance: number;
  qr_token: string;
}) {
  return {
    name: profile.name,
    phone_number: profile.phone_number,
    insta_name: profile.insta_name,
    points_balance: profile.points_balance,
    qr_token: profile.qr_token,
  };
}

/** Return the authenticated customer's public profile fields. */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Phiên đăng nhập không hợp lệ", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  if (session.role !== "CUSTOMER") {
    return NextResponse.json(
      { error: "Không có quyền truy cập", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  try {
    const profile = await prisma.user.findUnique({
      where: { id: session.id },
      select: profileSelect,
    });
    if (!profile) {
      return NextResponse.json(
        { error: "Không tìm thấy tài khoản", code: "NOT_FOUND" },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: publicProfile(profile) }, { status: 200 });
  } catch (error: unknown) {
    console.error("[GET /api/profile]", error);
    return NextResponse.json(
      { error: "Không thể tải thông tin tài khoản", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}

/** Update the authenticated customer's display name or Instagram alias. */
export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = UpdateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
        code: "VALIDATION_ERROR",
      },
      { status: 400 },
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Phiên đăng nhập không hợp lệ", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  if (session.role !== "CUSTOMER") {
    return NextResponse.json(
      { error: "Không có quyền truy cập", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  try {
    const currentUser = await prisma.user.findUnique({
      where: { id: session.id },
      select: {
        ...profileSelect,
        password_hash: true,
      },
    });
    if (!currentUser) {
      return NextResponse.json(
        { error: "Không tìm thấy tài khoản", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const instagramChanged =
      parsed.data.insta_name !== undefined &&
      parsed.data.insta_name !== currentUser.insta_name;
    if (instagramChanged && !parsed.data.current_password) {
      return NextResponse.json(
        {
          error: "Vui lòng nhập mật khẩu hiện tại để đổi Instagram",
          code: "VALIDATION_ERROR",
          details: { field: "current_password" },
        },
        { status: 400 },
      );
    }
    if (instagramChanged) {
      const passwordMatches = await bcrypt.compare(
        parsed.data.current_password!,
        currentUser.password_hash,
      );
      if (!passwordMatches) {
        return NextResponse.json(
          {
            error: "Mật khẩu hiện tại không đúng",
            code: "VALIDATION_ERROR",
            details: { field: "current_password" },
          },
          { status: 400 },
        );
      }
    }

    const data: { name?: string; insta_name?: string | null } = {};
    if (
      parsed.data.name !== undefined &&
      parsed.data.name !== currentUser.name
    ) {
      data.name = parsed.data.name;
    }
    if (instagramChanged) {
      data.insta_name = parsed.data.insta_name;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { data: publicProfile(currentUser) },
        { status: 200 },
      );
    }

    const updated = await prisma.user.update({
      where: { id: session.id },
      data,
      select: profileSelect,
    });
    return NextResponse.json({ data: updated }, { status: 200 });
  } catch (error: unknown) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json(
        {
          error: "Tên Instagram này đã được sử dụng",
          code: "CONFLICT",
          details: { field: "insta_name" },
        },
        { status: 409 },
      );
    }
    console.error("[PATCH /api/profile]", error);
    return NextResponse.json(
      { error: "Không thể cập nhật thông tin", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
