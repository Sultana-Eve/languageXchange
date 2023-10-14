import { Injectable } from '@angular/core';
import { ApiService } from '../api/api.service';
import { environment } from 'src/environments/environment';
import { Query } from 'appwrite';
import { AuthService } from '../auth/auth.service';
import { UserService } from '../user/user.service';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class RoomService {
  rooms: BehaviorSubject<any[]> = new BehaviorSubject<any[]>([]);
  cUserId: string;

  constructor(
    private api: ApiService,
    private authService: AuthService,
    private userService: UserService
  ) {}

  // Update rooms behavior subject
  async updateRooms(room) {
    room = await this.fillRoomWithUserData(room, this.cUserId);
    room = await this.fillRoomWithLastMessage(room);
    const currentRooms = this.rooms.getValue();
    const existingRoom = currentRooms.find((r) => r.$id === room.$id);
    if (existingRoom) {
      // Update the existing room item in the array
      const updatedRooms = currentRooms.map((r) => {
        if (r === existingRoom) {
          return room;
        }
        return r;
      });
      this.rooms.next(updatedRooms);
    } else {
      // Add the new room item to the array
      const newRooms = [...currentRooms, room];
      this.rooms.next(newRooms);
    }
  }

  async checkRoom(userId: string): Promise<any> {
    let cUserId = this.authService.getUserId();
    console.log('checkRoom: ', cUserId, userId);

    const promise = this.api.listDocuments(
      environment.appwrite.ROOMS_COLLECTION,
      [Query.search('users', cUserId), Query.search('users', userId)]
    );

    return promise.then((values) => {
      console.log('result checkROOM: ', values);
      if (values.total > 0) {
        console.log('Room found: ', values);
        return values.documents[0];
      } else {
        console.log('No room find, creating new one');
        return this.createRoom(userId);
      }
    });
  }

  // Get rooms from current session to initialize the message tab
  async listRooms(currentUserId: string) {
    this.cUserId = currentUserId;
    const promise = this.api.listDocuments(
      environment.appwrite.ROOMS_COLLECTION,
      [Query.search('users', currentUserId)]
    );
    await promise.then((values) => {
      values.documents.forEach((room) => {
        room = this.fillRoomWithUserData(room, currentUserId);
        room = this.fillRoomWithLastMessage(room);
      });
      // TODO: Order rooms by last message $createdAt
      /*
      values.documents.sort((a, b) => {
        const aLastMessage = a.lastMessage;
        const bLastMessage = b.lastMessage;
        if (aLastMessage && bLastMessage) {
          return bLastMessage.$createdAt - aLastMessage.$createdAt;
        } else if (aLastMessage) {
          return -1;
        } else if (bLastMessage) {
          return 1;
        } else {
          return 0;
        }
      });
      */
      console.log('listRooms: ', values.documents);
      this.rooms.next(values.documents);
    });
  }

  fillRoomWithUserData(room, currentUserId) {
    // Check if the user is not the current user
    room.users.forEach((userId) => {
      if (userId != currentUserId) {
        // Get the user data and add it to the element as userData
        room.userData = this.userService.getUserDoc(userId).then(
          (data) => {
            room.userData = data;
          },
          (error) => {
            console.log('error: ', error);
          }
        );
      }
    });
    return room;
  }

  async fillRoomWithLastMessage(room) {
    // Set Last message of every room
    const lastMessage = room.messages[room.messages.length - 1];
    room.lastMessage = lastMessage;
    return room;
  }

  getRoom(roomId: string): Promise<any> {
    return this.api.getDocument(environment.appwrite.ROOMS_COLLECTION, roomId);
  }

  async createRoom(userId: string): Promise<any> {
    // It triggers a function that creates a room
    const body = JSON.stringify({ to: userId });
    return await this.api.functions
      .createExecution('createRoom', body)
      .then((result) => {
        console.log('execution:', result);
        if (result.status === 'completed') {
          return JSON.parse(result.responseBody);
        } else {
          return Promise.reject({
            message: 'Execution Failed, Please try again later!',
          });
        }
      })
      .catch((error) => {
        console.log('error: ', error);
        return Promise.reject(error);
      });
  }

  listenRooms() {
    console.log('listenRooms started');
    const client = this.api.client$();
    return client.subscribe(
      'databases.' +
        environment.appwrite.APP_DATABASE +
        '.collections.' +
        environment.appwrite.ROOMS_COLLECTION +
        '.documents',
      (response) => {
        console.log(response);
      }
    );
  }
}