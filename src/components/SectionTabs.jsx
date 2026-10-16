import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Card, CardContent } from "./ui/card";

// One admin section showing several related screens as tabs. Tabs render only when opened,
// so each screen loads its data on first visit rather than all at once.
export function SectionTabs({ tabs, value, onValueChange }) {
	const visible = tabs.filter((tab) => tab.show !== false);
	return (
		<Tabs value={value} onValueChange={onValueChange} className="space-y-6">
			<Card>
				<CardContent className="p-2">
					<TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
						{visible.map((tab) => (
							<TabsTrigger key={tab.value} value={tab.value} className="gap-2">
								{tab.icon && <tab.icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
								{tab.label}
							</TabsTrigger>
						))}
					</TabsList>
				</CardContent>
			</Card>
			{visible.map((tab) => (
				<TabsContent key={tab.value} value={tab.value} className="mt-0 motion-rise">
					{tab.content}
				</TabsContent>
			))}
		</Tabs>
	);
}
