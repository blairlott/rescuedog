import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, XCircle, Clock, Gift, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ReferralReward {
  id: string;
  created_at: string;
  referrer_id: string;
  referred_id: string;
  referred_email: string | null;
  referred_name: string | null;
  status: string;
  referrer_points: number;
  referred_points: number;
  admin_note: string | null;
  approved_at: string | null;
  referrer_email?: string;
  referrer_name?: string;
}

const DEFAULT_POINTS = 100;

export function ReferralAdminTab() {
  const [rewards, setRewards] = useState<ReferralReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [pointsMap, setPointsMap] = useState<Record<string, string>>({});

  const fetchRewards = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("referral_rewards")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load referrals");
      setLoading(false);
      return;
    }

    // Enrich with referrer info
    const referrerIds = [...new Set((data || []).map((r: any) => r.referrer_id))];
    const { data: profiles } = await supabase
      .from("customer_profiles")
      .select("id, email, display_name")
      .in("id", referrerIds);

    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

    const enriched = (data || []).map((r: any) => {
      const referrerProfile = profileMap.get(r.referrer_id);
      return {
        ...r,
        referrer_email: referrerProfile?.email || "Unknown",
        referrer_name: referrerProfile?.display_name || "Unknown",
      };
    });

    setRewards(enriched);
    // Default points values
    const defaults: Record<string, string> = {};
    enriched.forEach((r: ReferralReward) => {
      if (r.status === "pending") {
        defaults[r.id] = String(DEFAULT_POINTS);
      }
    });
    setPointsMap(prev => ({ ...defaults, ...prev }));
    setLoading(false);
  };

  useEffect(() => {
    fetchRewards();
  }, []);

  const approveReferral = async (reward: ReferralReward) => {
    setProcessingId(reward.id);
    const points = parseInt(pointsMap[reward.id] || String(DEFAULT_POINTS));
    if (isNaN(points) || points < 0) {
      toast.error("Invalid points value");
      setProcessingId(null);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("referral_rewards")
      .update({
        status: "approved",
        referrer_points: points,
        referred_points: points,
        approved_at: new Date().toISOString(),
        approved_by: user?.id,
      } as any)
      .eq("id", reward.id);

    if (error) {
      toast.error("Failed to approve referral");
    } else {
      toast.success(`Approved! ${points} points credited to both users`);
      fetchRewards();
    }
    setProcessingId(null);
  };

  const rejectReferral = async (reward: ReferralReward) => {
    setProcessingId(reward.id);
    const { error } = await supabase
      .from("referral_rewards")
      .update({ status: "rejected" } as any)
      .eq("id", reward.id);

    if (error) {
      toast.error("Failed to reject referral");
    } else {
      toast.success("Referral rejected");
      fetchRewards();
    }
    setProcessingId(null);
  };

  const pending = rewards.filter(r => r.status === "pending");
  const processed = rewards.filter(r => r.status !== "pending");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Gift className="w-5 h-5 text-primary" />
        <div>
          <h2 className="text-lg font-bold text-foreground">Referral Rewards</h2>
          <p className="text-sm text-muted-foreground">Review and approve referral signups. Points are credited to both parties.</p>
        </div>
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Pending Approval ({pending.length})
          </h3>
          <div className="border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referrer</TableHead>
                  <TableHead>New Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Points</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{r.referrer_name}</p>
                        <p className="text-xs text-muted-foreground">{r.referrer_email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{r.referred_name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{r.referred_email || "—"}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        className="w-20 h-8 text-sm"
                        value={pointsMap[r.id] || String(DEFAULT_POINTS)}
                        onChange={e => setPointsMap(m => ({ ...m, [r.id]: e.target.value }))}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-green-700 border-green-300 hover:bg-green-50"
                          disabled={processingId === r.id}
                          onClick={() => approveReferral(r)}
                        >
                          {processingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/5"
                          disabled={processingId === r.id}
                          onClick={() => rejectReferral(r)}
                        >
                          <XCircle className="h-3.5 w-3.5" /> Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {pending.length === 0 && (
        <div className="text-center py-8 border border-border rounded-md">
          <CheckCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No pending referrals to review</p>
        </div>
      )}

      {/* Processed */}
      {processed.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2">History ({processed.length})</h3>
          <div className="border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referrer</TableHead>
                  <TableHead>New Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Points</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processed.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <p className="text-sm">{r.referrer_name}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{r.referred_name || r.referred_email || "—"}</p>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {r.status === "approved" ? (
                        <Badge className="bg-green-100 text-green-800 gap-1"><CheckCircle className="h-3 w-3" />Approved</Badge>
                      ) : (
                        <Badge className="bg-destructive/10 text-destructive gap-1"><XCircle className="h-3 w-3" />Rejected</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {r.status === "approved" ? `${r.referrer_points} each` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
