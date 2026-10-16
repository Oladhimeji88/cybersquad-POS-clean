import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback } from './ui/avatar';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { CheckCircle, XCircle, Eye } from 'lucide-react';

const pendingTechnicians = [
  { id: 2, name: 'Sarah Williams', email: 'sarah@example.com', expertise: 'Plumbing', submittedDate: '2024-10-15', documents: 3 },
  { id: 5, name: 'Tom Johnson', email: 'tom@example.com', expertise: 'Electrical', submittedDate: '2024-10-14', documents: 3 },
];

export function ReviewQueueModal({ open, onOpenChange }) {
  const [selectedTech, setSelectedTech] = useState(null);

  const getInitials = (name) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const handleViewDetails = (tech) => {
    console.log('View details for:', tech.name);
    // This would open the TechnicianDetailsModal
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Verification Review Queue</DialogTitle>
          <DialogDescription>
            Review and approve pending technician applications
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-140px)] pr-4">
          <div className="space-y-4">
            {pendingTechnicians.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold mb-2">All caught up!</h3>
                <p className="text-sm text-muted-foreground">
                  No pending verifications at the moment.
                </p>
              </div>
            ) : (
              pendingTechnicians.map((tech) => (
                <div key={tech.id} className="border rounded-lg p-4">
                  <div className="flex items-start gap-4">
                    <Avatar className="w-12 h-12">
                      <AvatarFallback className="bg-gradient-to-br from-purple-600 to-purple-800 text-white">
                        {getInitials(tech.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-semibold">{tech.name}</h4>
                          <p className="text-sm text-muted-foreground">{tech.email}</p>
                        </div>
                        <Badge className="bg-warning text-white">
                          Pending Review
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Expertise:</span>
                          <span className="ml-2 font-medium">{tech.expertise}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Submitted:</span>
                          <span className="ml-2 font-medium">{tech.submittedDate}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Documents:</span>
                          <span className="ml-2 font-medium">{tech.documents} uploaded</span>
                        </div>
                      </div>

                      <Separator />

                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="flex-1"
                          onClick={() => handleViewDetails(tech)}
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          View Details
                        </Button>
                        <Button 
                          variant="destructive" 
                          size="sm"
                          onClick={() => console.log('Reject:', tech.id)}
                        >
                          <XCircle className="w-4 h-4 mr-2" />
                          Reject
                        </Button>
                        <Button 
                          size="sm"
                          className="bg-success hover:bg-success-700"
                          onClick={() => console.log('Approve:', tech.id)}
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Approve
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
