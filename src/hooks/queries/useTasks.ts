import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";
import {
	type Task,
	type TaskProgressEvent,
	type TaskStatus,
	taskService,
} from "@/services/invoke";

const activeTaskStatuses = new Set<TaskStatus>([
	"pending",
	"running",
	"paused",
]);

export const taskKeys = {
	all: ["tasks"] as const,
};

function tasksQueryOptions() {
	return queryOptions({
		queryKey: taskKeys.all,
		queryFn: () => taskService.listTasks(),
		structuralSharing: (previous, next) => {
			const previousTasks = previous as Task[] | undefined;
			const nextTasks = next as Task[];
			if (!previousTasks) return nextTasks;
			const previousById = new Map(
				previousTasks.map((task) => [task.id, task]),
			);
			return nextTasks.map((task) => {
				const cached = previousById.get(task.id);
				const bytesPerSecond =
					task.bytes_per_second ?? cached?.bytes_per_second;
				if (
					task.status !== "running" ||
					task.stage !== "downloading" ||
					cached?.status !== "running" ||
					cached.stage !== "downloading" ||
					bytesPerSecond == null
				) {
					return task;
				}
				return { ...task, bytes_per_second: bytesPerSecond };
			});
		},
	});
}

type UseTasksOptions = {
	enabled?: boolean;
	pollActive?: boolean;
};

export function useTasks({
	enabled = true,
	pollActive = false,
}: UseTasksOptions = {}) {
	return useQuery({
		...tasksQueryOptions(),
		enabled,
		refetchInterval: pollActive
			? (query) =>
					query.state.data?.some((task) => activeTaskStatuses.has(task.status))
						? 1500
						: false
			: false,
	});
}

export function useActiveTaskCount() {
	const tasksQuery = useTasks();
	return {
		...tasksQuery,
		data: tasksQuery.data?.reduce(
			(count, task) => count + Number(activeTaskStatuses.has(task.status)),
			0,
		),
	};
}

export function useTaskCache() {
	const queryClient = useQueryClient();

	const fetchTasks = useCallback(
		() => queryClient.fetchQuery({ ...tasksQueryOptions(), staleTime: 0 }),
		[queryClient],
	);
	const prependTask = useCallback(
		(task: Task) => {
			queryClient.setQueryData<Task[]>(taskKeys.all, (current) => {
				if (!current) return [task];
				return current.some((item) => item.id === task.id)
					? current
					: [task, ...current];
			});
		},
		[queryClient],
	);
	const updateTask = useCallback(
		(updated: Task) => {
			queryClient.setQueryData<Task[]>(taskKeys.all, (current) =>
				current?.map((task) => (task.id === updated.id ? updated : task)),
			);
		},
		[queryClient],
	);
	const updateTaskProgress = useCallback(
		(event: TaskProgressEvent) => {
			queryClient.setQueryData<Task[]>(taskKeys.all, (current) =>
				current?.map((task) =>
					task.id === event.task_id
						? {
								...task,
								status: event.status,
								stage: event.stage,
								progress_current: event.progress_current,
								progress_total: event.progress_total,
								progress_unit: event.progress_unit,
								bytes_per_second: event.bytes_per_second,
							}
						: task,
				),
			);
		},
		[queryClient],
	);
	const removeTask = useCallback(
		(taskId: number) => {
			queryClient.setQueryData<Task[]>(taskKeys.all, (current) =>
				current?.filter((task) => task.id !== taskId),
			);
		},
		[queryClient],
	);
	const invalidateTasks = useCallback(
		() => queryClient.invalidateQueries({ queryKey: taskKeys.all }),
		[queryClient],
	);

	return {
		fetchTasks,
		prependTask,
		updateTask,
		updateTaskProgress,
		removeTask,
		invalidateTasks,
	};
}

export type TaskAction = "pause" | "resume" | "cancel" | "retry" | "delete";

type TaskActionVariables = {
	taskId: number;
	action: TaskAction;
};

async function executeTaskAction({
	taskId,
	action,
}: TaskActionVariables): Promise<Task | undefined> {
	switch (action) {
		case "pause":
			return await taskService.pauseTask(taskId);
		case "resume":
			return await taskService.resumeTask(taskId);
		case "cancel":
			return await taskService.cancelTask(taskId);
		case "retry":
			return await taskService.retryTask(taskId);
		case "delete":
			await taskService.deleteTask(taskId);
			return undefined;
	}
}

export function useTaskActions() {
	const { removeTask, updateTask } = useTaskCache();

	return useMutation({
		mutationFn: executeTaskAction,
		onSuccess: (updated, { taskId, action }) => {
			if (action === "delete") {
				removeTask(taskId);
			} else if (updated) {
				updateTask(updated);
			}
		},
	});
}
