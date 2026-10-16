import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Plus, Edit, Trash2, AlertTriangle } from 'lucide-react';
import { useState, useEffect } from 'react';


// Load dispute types from localStorage or use default
const loadDisputeTypes = () => {
  const saved = localStorage.getItem('disputeTypes');
  if (saved) {
    return JSON.parse(saved);
  }
  // Default dispute types if none saved
  return [
    { id: '1', name: 'Payment', priority: 'high' },
    { id: '2', name: 'Work Quality', priority: 'medium' },
    { id: '3', name: 'Cancellation', priority: 'low' },
    { id: '4', name: 'Delay', priority: 'medium' },
  ];
};

// Save dispute types to localStorage
const saveDisputeTypes = (types) => {
  localStorage.setItem('disputeTypes', JSON.stringify(types));
};

export function DisputeTypeModal({ open, onClose }) {
  const [disputeTypes, setDisputeTypes] = useState(() => loadDisputeTypes());
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    priority: 'medium' 
  });

  const handleAdd = () => {
    if (!formData.name.trim()) {
      alert('Please enter a dispute type name');
      return;
    }

    const newType = {
      id: Date.now().toString(),
      name: formData.name,
      priority: formData.priority
    };

    setDisputeTypes([...disputeTypes, newType]);
    setFormData({ name: '', priority: 'medium' });
  };

  const handleEdit = (type) => {
    setIsEditing(true);
    setEditingId(type.id);
    setFormData({ name: type.name, priority: type.priority });
  };

  const handleUpdate = () => {
    if (!formData.name.trim()) {
      alert('Please enter a dispute type name');
      return;
    }

    setDisputeTypes(disputeTypes.map(type => 
      type.id === editingId 
        ? { ...type, name: formData.name, priority: formData.priority }
        : type
    ));
    setIsEditing(false);
    setEditingId(null);
    setFormData({ name: '', priority: 'medium' });
  };

  const handleDelete = (id) => {
    if (confirm('Are you sure you want to delete this dispute type?')) {
      setDisputeTypes(disputeTypes.filter(type => type.id !== id));
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditingId(null);
    setFormData({ name: '', priority: 'medium' });
  };

  const handleSave = () => {
    saveDisputeTypes(disputeTypes);
    onClose();
  };

  useEffect(() => {
    saveDisputeTypes(disputeTypes);
  }, [disputeTypes]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dispute Type Management</DialogTitle>
          <DialogDescription>
            Add, edit, or delete dispute types and assign priority levels
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="p-4 border rounded-lg space-y-4">
            <h4 className="font-medium">{isEditing ? 'Edit' : 'Add'} Dispute Type</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="typeName">Dispute Type Name</Label>
                <Input
                  id="typeName"
                  placeholder="e.g., Refund Request"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">Priority Level</Label>
                <Select 
                  value={formData.priority} 
                  onValueChange={(value) => 
                    setFormData({ ...formData, priority: value })
                  }
                >
                  <SelectTrigger id="priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              {isEditing ? (
                <>
                  <Button onClick={handleUpdate}>Update Type</Button>
                  <Button variant="outline" onClick={handleCancel}>Cancel</Button>
                </>
              ) : (
                <Button onClick={handleAdd}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Dispute Type
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="font-medium">Existing Dispute Types</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type Name</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {disputeTypes.map((type) => (
                  <TableRow key={type.id}>
                    <TableCell className="font-medium">{type.name}</TableCell>
                    <TableCell>
                      <Badge 
                        variant={
                          type.priority === 'high' ? 'destructive' :
                          type.priority === 'medium' ? 'default' :
                          'secondary'
                        }
                        className="w-20 justify-center"
                      >
                        {type.priority === 'high' && <AlertTriangle className="h-4 w-4 mr-1" />}
                        {type.priority}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleEdit(type)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleDelete(type.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
