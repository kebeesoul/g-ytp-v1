import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { ProjectRecordSchema } from "@/lib/schema";
import { checkImportFilesExist } from "@/lib/workspace";

export async function GET(): Promise<Response> {
  const { data, error } = await supabaseServer
    .from("projects")
    .select("*")
    .eq("status", "done")
    .order("exported_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const parsed = z.array(ProjectRecordSchema).safeParse(data ?? []);
  if (!parsed.success) {
    return Response.json({ error: "schema validation failed" }, { status: 500 });
  }

  const records = parsed.data.map((record) => ({
    ...record,
    filesAvailable: checkImportFilesExist(record.id),
  }));

  return Response.json(records);
}
