import { Link } from "react-router-dom";
import { FileQuestion } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";

export default function NotFound() {
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Lost" title="Page not found" back={false} />
      <EmptyState
        icon={<FileQuestion className="h-5 w-5" />}
        title="We can't find that page"
        description="The link may be wrong or the page may have moved."
        action={
          <Link to="/" className="btn-secondary">
            Back to home
          </Link>
        }
      />
    </div>
  );
}
