import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Calendar } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar as CalendarIcon, FileSpreadsheet, FileText } from 'lucide-react';
import { useEffect, useState } from 'react';

export function ExportModal({ open, onClose, type, onExport }) {
  const [fileFormat, setFileFormat] = useState('csv');
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);

  useEffect(() => {
    if (open) {
      setFileFormat('csv');
      setDateFrom(null);
      setDateTo(null);
    }
  }, [open]);

  const handleExport = () => {
    onExport?.({ type, fileFormat, dateFrom, dateTo });
    onClose?.();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Export {type === "payment" ? "Payments" : type === "payout" ? "Payouts" : type === "dispute" ? "Disputes" : type === "sla-dispute" ? "SLA Disputes" : "Data"}
          </DialogTitle>
          <DialogDescription>Download your data in your preferred format</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-4">
            <Label>File Format</Label>
            <RadioGroup value={fileFormat} onValueChange={setFileFormat}>
              <div className="flex items-center space-x-2 p-4 border rounded-lg cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="csv" id="csv" />
                <Label htmlFor="csv" className="flex items-center gap-2 cursor-pointer flex-1">
                  <FileSpreadsheet className="w-4 h-4 text-green-600" />
                  <div>
                    <p className="font-medium">CSV</p>
                    <p className="text-xs text-muted-foreground">Best for Excel and data analysis</p>
                  </div>
                </Label>
              </div>

              <div className="flex items-center space-x-2 p-4 border rounded-lg cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="pdf" id="pdf" />
                <Label htmlFor="pdf" className="flex items-center gap-2 cursor-pointer flex-1">
                  <FileText className="w-4 h-4 text-red-600" />
                  <div>
                    <p className="font-medium">PDF</p>
                    <p className="text-xs text-muted-foreground">Opens a printable view (Save as PDF)</p>
                  </div>
                </Label>
              </div>

              <div className="flex items-center space-x-2 p-4 border rounded-lg cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="excel" id="excel" />
                <Label htmlFor="excel" className="flex items-center gap-2 cursor-pointer flex-1">
                  <FileSpreadsheet className="w-4 h-4 text-green-700" />
                  <div>
                    <p className="font-medium">Excel</p>
                    <p className="text-xs text-muted-foreground">Downloads CSV (Excel opens it fine)</p>
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </div>
{/* 
          <div className="space-y-2">
            <Label>Date Range</Label>
            <div className="grid grid-cols-2 gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start text-left">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom
                      ? dateFrom.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : 'From'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start text-left">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo
                      ? dateTo.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : 'To'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
          </div> */}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleExport}>Export {fileFormat.toUpperCase()}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
