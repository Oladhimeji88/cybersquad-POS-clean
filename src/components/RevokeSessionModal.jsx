import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';

export function RevokeSessionModal({ open, onClose, session }) {
  const handleRevoke = () => {
    alert(`Session revoked for ${session.admin}`);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Revoke Session</DialogTitle>
          <DialogDescription>
            Confirm session termination
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertCircle className="w-4 h-4" />
            <AlertDescription>
              This will immediately log out the user from this session. They will need to log in again to access the admin panel.
            </AlertDescription>
          </Alert>

          <div className="p-4 bg-muted rounded-lg space-y-2">
            <div>
              <p className="text-sm text-muted-foreground">Admin User</p>
              <p className="font-medium">{session.admin}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Device & Browser</p>
              <p className="font-medium">{session.device}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Location</p>
              <p className="font-medium">{session.location}</p>
            </div>
          </div>

          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-900">
            <strong>Note:</strong> The user will be notified that their session was revoked by an administrator.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={handleRevoke}>
            Revoke Session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
