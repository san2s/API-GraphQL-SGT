// Importar las dependencias necesarias
import { ApolloServer } from '@apollo/server';
import { createServer } from 'http';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import bodyParser from 'body-parser';
import express from 'express';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { PubSub } from 'graphql-subscriptions';
import { readFileSync } from 'fs';
import { makeExecutableSchema } from '@graphql-tools/schema';

// Leer el esquema GraphQL desde un archivo externo
const typeDefs = readFileSync('./schema.graphql', 'utf8');

// Crear una instancia de PubSub
const pubsub = new PubSub();
const TASK_UPDATED = 'TASK_UPDATED';
const TASK_ADDED = 'TASK_ADDED';

// Arreglo con información de prueba
let tasks = [];

const resolvers = {
    Query: {
        allTasks: () => tasks,
    },
    Mutation: {
        createTask: (root, { title, description, deadline }) => {
            const newTask = {
                id: `${tasks.length + 1}`,
                title,
                description,
                completed: false,
                deadline,
                createdAt: new Date().toISOString()
            };
            tasks.push(newTask);
            pubsub.publish(TASK_ADDED, { taskAdded: newTask });
            return newTask;
        },
        updateTaskState: (root, { id, completed }) => {
            const task = tasks.find(task => task.id === id);
            if (!task) return 'Tarea no encontrada';
            task.completed = completed;
            pubsub.publish(TASK_UPDATED, { taskUpdated: task });
            return task;
        },
        deleteTask: (root, { id }) => {
            const index = tasks.findIndex(task => task.id === id);
            if (index === -1) return 'Tarea no encontrada';
            tasks.splice(index, 1);
            return 'Tarea eliminada con éxito';
        },
    },
    Subscription: {
        taskAdded: {
            subscribe: () => pubsub.asyncIterator([TASK_ADDED])
        },
        taskUpdated: {
            subscribe: () => pubsub.asyncIterator([TASK_UPDATED])
        }
    }
};

const schema = makeExecutableSchema({ typeDefs, resolvers });
const app = express();
const httpServer = createServer(app);
const wsServer = new WebSocketServer({ server: httpServer, path: '/graphql' });
const wsServerCleanup = useServer({ schema }, wsServer);

const apolloServer = new ApolloServer({
    schema,
    plugins: [
        ApolloServerPluginDrainHttpServer({ httpServer }),
        {
            async serverWillStart() {
                return {
                    async drainServer() {
                        await wsServerCleanup.dispose();
                    }
                };
            }
        }
    ]
});

await apolloServer.start();
app.use('/graphql', bodyParser.json(), expressMiddleware(apolloServer));
httpServer.listen(3000, () => {
    console.log('🚀 Server ready at http://localhost:3000/graphql');
});
