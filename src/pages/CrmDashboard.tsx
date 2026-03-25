import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Eye, Pencil, Trash2, Upload, Clock, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSalesAccounts, useDeleteAccount, useUpsertAccount } from "@/hooks/useSalesAccounts";
import { useUserRole } from "@/hooks/useUserRole";
import { AccountFormDialog } from "@/components/crm/AccountFormDialog";
import { BulkImportDialog } from "@/components/crm/BulkImportDialog";
import { US_STATES } from "@/lib/usStates";
import { toast } from "sonner";
import type { SalesAccount } from "@/hooks/useSalesAccounts";
import { getStaleness, getStalenessLabel, getStalenessColor } from "@/lib/staleness";
import { EditableSelect } from "@/components/crm/EditableSelect";
import { ApprovalQueueTab, useApprovalCount } from "@/components/crm/ApprovalQueueTab";

const statusColors: Record<string, string> = {
  prospect: "bg-muted text-muted-foreground",
  active: "bg-primary/10 text-primary",
  won: "bg-green-100 text-green-800",
  lost: "bg-destructive/10 text-destructive",
};

const SALES_MANAGERS = [
  { name: "Jana Ritter", region: "National", tabId: "jana-ritter" },
  { name: "Jake Lenz", region: "CA/West", tabId: "jake-lenz" },
  { name: "", region: "GA/Southeast", tabId: "ga-southeast" },
];

export default function CrmDashboard() {
  const [stateFilter, setStateFilter] = useState("");
  const [premiseFilter, setPremiseFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<SalesAccount | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("jana-ritter");

  const { data: accounts = [], isLoading } = useSalesAccounts({
    state: stateFilter || undefined,
    premiseType: premiseFilter || undefined,
    status: statusFilter || undefined,
    search: search || undefined,
  });

  const { data: roleInfo } = useUserRole();
  const deleteAccount = useDeleteAccount();
  const upsertAccount = useUpsertAccount();

  const repNames = [...new Set(accounts.map((a) => a.rep_name).filter(Boolean))] as string[];
  for (const mgr of SALES_MANAGERS) {
    if (mgr.name && !repNames.includes(mgr.name)) repNames.push(mgr.name);
  }
  const distRepNames = [...new Set(accounts.map((a) => a.distributor_rep).filter(Boolean))] as string[];
  const myName = roleInfo?.profile?.full_name || "";

  // Filter accounts by tab
  const filteredAccounts = accounts.filter((a) => {
    if (activeTab === "jana-ritter") return true; // National manager sees all
    const managerTab = SALES_MANAGERS.find(m => m.tabId === activeTab);
    if (managerTab && managerTab.tabId !== "jana-ritter") {
      if (managerTab.name) {
        return a.rep_name?.toLowerCase() === managerTab.name.toLowerCase();
      }
      // Empty name tab: show accounts not assigned to any named manager
      const namedManagers = SALES_MANAGERS.filter(m => m.name).map(m => m.name.toLowerCase());
      return !namedManagers.includes((a.rep_name || '').toLowerCase());
    }
    if (activeTab === "prospects") return a.status === "prospect";
    if (activeTab === "active") return a.status === "active";
    return true;
  });

  const stats = {
    total: filteredAccounts.length,
    active: filteredAccounts.filter((a) => a.status === "active").length,
    prospects: filteredAccounts.filter((a) => a.status === "prospect").length,
    onPremise: filteredAccounts.filter((a) => a.premise_type === "on").length,
    offPremise: filteredAccounts.filter((a) => a.premise_type === "off").length,
  };

  const isMyAccount = (a: SalesAccount) =>
    a.rep_name?.toLowerCase() === myName.toLowerCase();

  const canEditAccount = (_a: SalesAccount) => true;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Accounts</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1" /> Import CSV
          </Button>
          <Button onClick={() => { setEditAccount(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Add Account
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          {SALES_MANAGERS.map((mgr) => (
            <TabsTrigger key={mgr.tabId} value={mgr.tabId}>
              {mgr.name ? `${mgr.name} (${mgr.region})` : mgr.region}
            </TabsTrigger>
          ))}
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="prospects">Prospects</TabsTrigger>
          <TabsTrigger value="all-accounts">All Accounts</TabsTrigger>
        </TabsList>

        <div className="mt-4 space-y-4">
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
            <div className="border border-border overflow-x-auto">
              <Table className="min-w-[1600px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Buyer</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Order</TableHead>
                    <TableHead>Distributor</TableHead>
                    <TableHead>Dist. Rep</TableHead>
                    <TableHead>Dist. Rep Contact</TableHead>
                    <TableHead>Sales Rep</TableHead>
                    <TableHead className="w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAccounts.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium text-xs">
                        <div className="flex items-center gap-1.5">
                          {a.account_name}
                          <Link to={`/crm/account/${a.id}`}>
                            <Button variant="ghost" size="icon" className="h-5 w-5 text-primary hover:text-primary/80">
                              <Info className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs max-w-[180px]">
                        {[a.street_address, a.city, a.state, a.zip].filter(Boolean).join(", ") || "—"}
                      </TableCell>
                      <TableCell className="text-xs">{a.buyer_name || "—"}</TableCell>
                      <TableCell className="text-xs">
                        {a.phone ? <a href={`tel:${a.phone}`} className="text-primary hover:underline">{a.phone}</a> : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {a.email ? <a href={`mailto:${a.email}`} className="text-primary hover:underline">{a.email}</a> : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {a.premise_type === "on" ? "On" : "Off"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${statusColors[a.status || "prospect"]}`}>
                          {a.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const level = getStaleness((a as any).last_order_date);
                          return (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded ${getStalenessColor(level)}`}>
                              {level && level !== "fresh" && <Clock className="h-3 w-3" />}
                              {getStalenessLabel(level)}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-xs">{a.distributor || "—"}</TableCell>
                      <TableCell>
                        <EditableSelect
                          value={a.distributor_rep || ""}
                          options={distRepNames}
                          placeholder="Assign"
                          onChange={(v) => {
                            upsertAccount.mutate(
                              { id: a.id, account_name: a.account_name, distributor_rep: v },
                              { onSuccess: () => toast.success(`Dist. rep set to ${v || "none"}`) }
                            );
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="space-y-0.5">
                          {(a as any).distributor_rep_phone && (
                            <a href={`tel:${(a as any).distributor_rep_phone}`} className="block text-primary hover:underline">{(a as any).distributor_rep_phone}</a>
                          )}
                          {(a as any).distributor_rep_email && (
                            <a href={`mailto:${(a as any).distributor_rep_email}`} className="block text-primary hover:underline truncate max-w-[140px]">{(a as any).distributor_rep_email}</a>
                          )}
                          {!(a as any).distributor_rep_phone && !(a as any).distributor_rep_email && "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {roleInfo?.isAdminOrOwner ? (
                          <Select
                            value={a.rep_name || ""}
                            onValueChange={(v) => {
                              upsertAccount.mutate(
                                { id: a.id, account_name: a.account_name, rep_name: v === "unassigned" ? null : v },
                                { onSuccess: () => toast.success(`Reassigned to ${v === "unassigned" ? "nobody" : v}`) }
                              );
                            }}
                          >
                            <SelectTrigger className="h-7 w-[130px] text-xs">
                              <SelectValue placeholder="Assign rep" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">Unassigned</SelectItem>
                              {repNames.map((name) => (
                                <SelectItem key={name} value={name}>{name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          a.rep_name || "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Link to={`/crm/account/${a.id}`}>
                            <Button variant="ghost" size="icon" className="h-8 w-8"><Eye className="h-3.5 w-3.5" /></Button>
                          </Link>
                          {canEditAccount(a) && (
                            <>
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
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredAccounts.length === 0 && (
                    <TableRow>
                       <TableCell colSpan={14} className="text-center text-muted-foreground py-8">
                        No accounts found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </Tabs>

      <AccountFormDialog open={formOpen} onOpenChange={setFormOpen} account={editAccount} />
      <BulkImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
