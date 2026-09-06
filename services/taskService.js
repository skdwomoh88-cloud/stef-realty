const Task = require("../models/Task");
const AppError = require("../utils/AppError");
const TASK_STATUS = require("../constants/taskStatus");
const REFERENCE_PREFIXES = require("../constants/referencePrefixes");
const {
    requireOwnership,
    requireRole,
} = require("../utils/authorization");
const ROLES = require("../constants/roles");

const {
    generateReferenceNumber,
} = require("../utils/referenceNumberGenerator");

const notificationService = require("./notificationService");
const { requireActiveAgent } = require("../utils/assignment");

const createTask = async (data, currentUser) => {
    await requireActiveAgent(data.assignedAgent);

    const taskNumber = await generateReferenceNumber(
        REFERENCE_PREFIXES.TASK,
        "task"
    );

    const task = await Task.create({
        taskNumber,
        title: data.title,
        description: data.description,
        assignedAgent: data.assignedAgent,
        assignedBy: currentUser._id,
        dueDate: data.dueDate,
        priority: data.priority,
        relatedProperty: data.relatedProperty,
        relatedInquiry: data.relatedInquiry,
        relatedViewingRequest: data.relatedViewingRequest,
        relatedOffer: data.relatedOffer,
        relatedDeal: data.relatedDeal,
        internalNotes: data.internalNotes,
    });

    await notificationService.createNotification({
        type: "Task",
        title: "New Task Assigned",
        message: `Task ${task.taskNumber} has been assigned to you.`,
        recipient: task.assignedAgent,
        relatedTask: task._id,
        relatedProperty: task.relatedProperty,
    });

    return await Task.findById(task._id)
        .populate("assignedAgent", "name email")
        .populate("assignedBy", "name email")
        .populate("relatedProperty", "title")
        .populate("relatedInquiry")
        .populate("relatedViewingRequest")
        .populate("relatedOffer", "offerNumber")
        .populate("relatedDeal", "dealNumber");
};

const getAllTasks = async ({
    page = 1,
    limit = 20,
    status,
    priority,
    assignedAgent,
    sortBy = "createdAt",
    sortOrder = "desc",
} = {}) => {
    page = Math.max(Number(page) || 1, 1);
    limit = Math.min(Math.max(Number(limit) || 20, 1), 100);

    const skip = (page - 1) * limit;

    const filter = {};

    if (status) {
        filter.status = status;
    }

    if (priority) {
        filter.priority = priority;
    }

    if (assignedAgent) {
        filter.assignedAgent = assignedAgent;
    }

    const allowedSortFields = [
        "createdAt",
        "updatedAt",
        "dueDate",
        "priority",
        "status",
        "title",
    ];

    if (!allowedSortFields.includes(sortBy)) {
        sortBy = "createdAt";
    }

    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const [tasks, total] = await Promise.all([
        Task.find(filter)
        .populate("assignedAgent", "name email")
        .populate("assignedBy", "name email")
            .populate("relatedProperty", "title")
            .populate("relatedInquiry")
            .populate("relatedViewingRequest")
            .populate("relatedOffer", "offerNumber")
            .populate("relatedDeal", "dealNumber")
            .sort({ [sortBy]: sortDirection })
            .skip(skip)
            .limit(limit),

        Task.countDocuments(filter),
    ]);

    return {
        tasks,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            hasNextPage: page < Math.ceil(total / limit),
            hasPreviousPage: page > 1,
        },
    };
};

const getMyTasks = async (
    agentId,
    {
        page = 1,
        limit = 20,
        status,
        priority,
        sortBy = "createdAt",
        sortOrder = "desc",
    } = {}
) => {
    page = Math.max(Number(page) || 1, 1);
    limit = Math.min(Math.max(Number(limit) || 20, 1), 100);

    const skip = (page - 1) * limit;

    const filter = {
        assignedAgent: agentId,
    };

    if (status) {
        filter.status = status;
    }

    if (priority) {
        filter.priority = priority;
    }

    const allowedSortFields = [
        "createdAt",
        "updatedAt",
        "dueDate",
        "priority",
        "status",
        "title",
    ];

    if (!allowedSortFields.includes(sortBy)) {
        sortBy = "createdAt";
    }

    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const [tasks, total] = await Promise.all([
        Task.find(filter)
        .populate("assignedAgent", "name email")
        .populate("assignedBy", "name email")
            .populate("relatedProperty", "title")
            .populate("relatedInquiry")
            .populate("relatedViewingRequest")
            .populate("relatedOffer", "offerNumber")
            .populate("relatedDeal", "dealNumber")
            .sort({ [sortBy]: sortDirection })
            .skip(skip)
            .limit(limit),

        Task.countDocuments(filter),
    ]);

    return {
        tasks,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            hasNextPage: page < Math.ceil(total / limit),
            hasPreviousPage: page > 1,
        },
    };
};

const getTaskById = async (id, currentUser) => {
    const task = await Task.findById(id)
        .populate("assignedAgent", "name email")
        .populate("assignedBy", "name email")
        .populate("relatedProperty", "title")
        .populate("relatedInquiry")
        .populate("relatedViewingRequest")
        .populate("relatedOffer", "offerNumber")
        .populate("relatedDeal", "dealNumber");

    if (!task) {
        throw new AppError(
            "Task not found.",
            404,
            "TASK_NOT_FOUND"
        );
    }

    // Ownership check
    requireOwnership(
        task,
        "assignedAgent",
        currentUser,
        "You are not authorized to view this task."
    );

    return task;
};

const updateTask = async (id, data, currentUser) => {
    const task = await Task.findById(id);

    if (!task) {
        throw new AppError(
            "Task not found.",
            404,
            "TASK_NOT_FOUND"
        );
    }

    // Ownership check
    requireOwnership(
        task,
        "assignedAgent",
        currentUser,
        "You are not authorized to update this task."
    );

    if (data.title !== undefined)
        task.title = data.title;

    if (data.description !== undefined)
        task.description = data.description;

    if (data.dueDate !== undefined)
        task.dueDate = data.dueDate;

    if (data.priority !== undefined)
        task.priority = data.priority;

    if (data.relatedProperty !== undefined)
        task.relatedProperty = data.relatedProperty;

    if (data.relatedInquiry !== undefined)
        task.relatedInquiry = data.relatedInquiry;

    if (data.relatedViewingRequest !== undefined)
        task.relatedViewingRequest = data.relatedViewingRequest;

    if (data.relatedOffer !== undefined)
        task.relatedOffer = data.relatedOffer;

    if (data.relatedDeal !== undefined)
        task.relatedDeal = data.relatedDeal;

    if (data.internalNotes !== undefined)
        task.internalNotes = data.internalNotes;

    await task.save();

    return await Task.findById(task._id)
        .populate("assignedAgent", "name email")
        .populate("assignedBy", "name email")
        .populate("relatedProperty", "title")
        .populate("relatedInquiry")
        .populate("relatedViewingRequest")
        .populate("relatedOffer", "offerNumber")
        .populate("relatedDeal", "dealNumber");
};

const updateTaskStatus = async (
    id,
    status,
    currentUser
) => {
    const task = await Task.findById(id);

    if (!task) {
        throw new AppError(
            "Task not found.",
            404,
            "TASK_NOT_FOUND"
        );
    }

    // Ownership check
    requireOwnership(
        task,
        "assignedAgent",
        currentUser,
        "You are not authorized to update this task."
    );

    task.status = status;

    if (status === TASK_STATUS.COMPLETED) {
        task.completedAt = new Date();
    } else {
        task.completedAt = null;
    }

    await task.save();

    return await Task.findById(task._id)
        .populate("assignedAgent", "name email")
        .populate("assignedBy", "name email")
        .populate("relatedProperty", "title")
        .populate("relatedInquiry")
        .populate("relatedViewingRequest")
        .populate("relatedOffer", "offerNumber")
        .populate("relatedDeal", "dealNumber");
};

const updateTaskAssignment = async (
    id,
    assignedAgent,
    currentUser
) => {
    const task = await Task.findById(id);

    if (!task) {
        throw new AppError(
            "Task not found.",
            404,
            "TASK_NOT_FOUND"
        );
    }

    requireRole(
        currentUser,
        [ROLES.ADMIN]
    );

    await requireActiveAgent(assignedAgent);

    // Prevent assigning to the same agent
    if (task.assignedAgent.toString() === assignedAgent.toString()) {
        throw new AppError(
            "Task is already assigned to this agent.",
            400,
            "TASK_ALREADY_ASSIGNED"
        );
    }

    task.assignedAgent = assignedAgent;
    task.assignedBy = currentUser._id;

    await task.save();

    await notificationService.createNotification({
        type: "Task",
        title: "Task Reassigned",
        message: `Task ${task.taskNumber} has been assigned to you.`,
        recipient: assignedAgent,
        relatedTask: task._id,
        relatedProperty: task.relatedProperty,
    });

    return await Task.findById(task._id)
        .populate("assignedAgent", "name email")
        .populate("assignedBy", "name email")
        .populate("relatedProperty", "title")
        .populate("relatedInquiry")
        .populate("relatedViewingRequest")
        .populate("relatedOffer", "offerNumber")
        .populate("relatedDeal", "dealNumber");
};

const deleteTask = async (id) => {
    const task = await Task.findById(id);

    if (!task) {
        throw new AppError(
            "Task not found.",
            404,
            "TASK_NOT_FOUND"
        );
    }

    if (task.status === TASK_STATUS.COMPLETED) {
        throw new AppError(
            "Completed tasks cannot be deleted.",
            400,
            "TASK_ALREADY_COMPLETED"
        );
    }

    await task.deleteOne();

    return;
};

module.exports = {
    createTask,
    getAllTasks,
    getMyTasks,
    getTaskById,
    updateTask,
    updateTaskStatus,
    updateTaskAssignment,
    deleteTask,
};
