import { AppMarker } from './AppMarker.js';
import { BreachCase } from './BreachCase.js';
import { DataSystem } from './DataSystem.js';
import { Event } from './Event.js';
import { Person } from './Person.js';
import { PrivacyRequest } from './PrivacyRequest.js';
import { Task } from './Task.js';

export type AppSchema = {
  Person: Person;
  AppMarker: AppMarker;
  PrivacyRequest: PrivacyRequest;
  BreachCase: BreachCase;
  DataSystem: DataSystem;
  Task: Task;
  Event: Event;
};

export const schema = [Person, AppMarker, PrivacyRequest, BreachCase, DataSystem, Task, Event];
