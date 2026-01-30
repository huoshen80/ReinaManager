import Cards from "@/components/Cards";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { PageContainer } from "@toolpad/core/PageContainer";

export const Libraries: React.FC = () => {
	useScrollRestore("/libraries", { useKeepAlive: true });
	return (
		<PageContainer sx={{ maxWidth: "100% !important" }}>
			<Cards />
		</PageContainer>
	);
};
