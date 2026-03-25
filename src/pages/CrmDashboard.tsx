import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Eye, Pencil, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useSalesAccounts, useDeleteAccount } from "@/hooks/useSalesAccounts";
import { AccountFormDialog } from "@/components/crm/AccountFormDialog";
import { BulkImportDialog } from "@/components/crm/BulkImportDialog";
import { US_STATES } from "@/lib/usStates";
import { toast } from "sonner";
import type { SalesAccount } from "@/hooks/useSalesAccounts";

const statusColors: Record<string, string> = {
  prospect: "bg-muted text-muted-foreground",
  active: "bg-primary/10 text-primary",
  won: "bg-green-100 text-green-800",
  lost: "bg-destructive/10 text-destructive",
};

export default function CrmDashboard() {
  const [stateFilter, setStateFilter] = useState("");
  const [premiseFilter, setPremiseFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<SalesAccount | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const { data: accounts = [], isLoading } = useSalesAccounts({
    state: stateFilter || undefined,
    premiseType: premiseFilter || undefined,
    status: statusFilter || undefined,
    search: search || undefined,
  });

  const deleteAccount = useDeleteAccount();

  const stats = {
    total: accounts.length,
    active: accounts.filter((a) => a.status === "active").length,
    prospects: accounts.filter((a) => a.status === "prospect").length,
    onPremise: accounts.filter((a) => a.premise_type === "on").length,
    offPremise: accounts.filter((a) => a.premise_type === "off").length,
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Accounts</h1>
        <Button onClick={() => { setEditAccount(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Add Account
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total", value: stats.total },
          { label: "Active", value: stats.active },
          { label: "Prospects", value: stats.prospects },
          { label: "On Premise", value: stats.onPremise },
          { label: "Off Premise", value: stats.offPremise },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-brand">{s.label}</p>
            <p className="text-2xl font-bold text-foreground">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search accounts..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={stateFilter} onValueChange={(v) => setStateFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="All States" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            {US_STATES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={premiseFilter} onValueChange={(v) => setPremiseFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="on">On Premise</SelectItem>
            <SelectItem value="off">Off Premise</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="prospect">Prospect</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="won">Won</SelectItem>
            <SelectItem value="lost">Lost</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <div className="border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>City, State</TableHead>
                <TableHead>Rep</TableHead>
                <TableHead className="w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.account_name}</TableCell>
                  <TableCell>{a.buyer_name || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {a.premise_type === "on" ? "On Premise" : "Off Premise"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${statusColors[a.status || "prospect"]}`}>
                      {a.status}
                    </span>
                  </TableCell>
                  <TableCell>{[a.city, a.state].filter(Boolean).join(", ") || "—"}</TableCell>
                  <TableCell>{a.rep_name || "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Link to={`/crm/account/${a.id}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><Eye className="h-3.5 w-3.5" /></Button>
                      </Link>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditAccount(a); setFormOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => {
                        if (confirm("Delete this account?")) {
                          deleteAccount.mutate(a.id, { onSuccess: () => toast.success("Deleted") });
                        }
                      }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {accounts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No accounts found</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <AccountFormDialog open={formOpen} onOpenChange={setFormOpen} account={editAccount} />
    </div>
  );
}
