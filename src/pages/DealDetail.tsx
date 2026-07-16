import { Link, useParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { StatusPill } from "@/components/StatusPill";
import { ReceiptSummary } from "@/components/ReceiptSummary";
import { ShareLinkCard } from "@/components/ShareLinkCard";
import { WhatHappensNext } from "@/components/WhatHappensNext";
import { DisputeBanner } from "@/components/DisputeBanner";
import { EmptyState } from "@/components/EmptyState";
import { DealLoader } from "@/components/PageLoader";
import { useDealWithRemoteLoad } from "@/hooks/useDealWithRemoteLoad";
import { FileQuestion, ArrowRight } from "lucide-react";

export default function DealDetail() {
  const { id } = useParams<{ id: string }>();
  const { deal, loading } = useDealWithRemoteLoad(id);

  if (!deal && loading) return <DealLoader title="Opening deal" />;
  if (!deal) return <DealNotFound id={id} />;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`Deal · ${deal.id}`}
        title={deal.title}
        right={<StatusPill status={deal.status} />}
      />

      <DisputeBanner deal={deal} />

      <WhatHappensNext status={deal.status} />

      <ReceiptSummary deal={deal} />

      <ShareLinkCard dealId={deal.id} />

      <Link
        to={`/deal/${deal.id}/status`}
        className="btn-secondary w-full"
      >
        View status & timeline
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function DealNotFound({ id }: { id?: string }) {
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Deal" title="Not found" />
      <EmptyState
        icon={<FileQuestion className="h-5 w-5" />}
        title="Deal not found"
        description={id ? `No deal with ID "${id}".` : "Missing deal ID."}
        action={
          <Link to="/" className="btn-secondary">
            Back to home
          </Link>
        }
      />
    </div>
  );
}
