import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  Message,
} from '@aws-sdk/client-sqs';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SqsMessage {
  messageId: string;
  receiptHandle: string;
  body: string;
  attributes: Record<string, string>;
}

@Injectable()
export class SqsClientService {
  private readonly client: SQSClient;
  private readonly logger = new Logger(SqsClientService.name);
  private readonly wageringQueueUrl: string;
  private readonly dlqUrl: string;

  constructor(private readonly configService: ConfigService) {
    const sqsCfg = this.configService.get('sqs') as {
      region: string;
      endpoint: string;
      accessKeyId: string;
      secretAccessKey: string;
      wageringQueueUrl: string;
      wageringDlqUrl: string;
    };

    this.client = new SQSClient({
      region: sqsCfg.region,
      endpoint: sqsCfg.endpoint,
      credentials: {
        accessKeyId: sqsCfg.accessKeyId,
        secretAccessKey: sqsCfg.secretAccessKey,
      },
    });

    this.wageringQueueUrl = sqsCfg.wageringQueueUrl;
    this.dlqUrl = sqsCfg.wageringDlqUrl;
  }

  async receiveMessages(maxMessages = 10, waitTimeSeconds = 20): Promise<SqsMessage[]> {
    const response = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: this.wageringQueueUrl,
        MaxNumberOfMessages: maxMessages,
        WaitTimeSeconds: waitTimeSeconds,
        AttributeNames: ['All'],
        MessageAttributeNames: ['All'],
      }),
    );

    return (response.Messages ?? []).map((msg: Message) => ({
      messageId: msg.MessageId!,
      receiptHandle: msg.ReceiptHandle!,
      body: msg.Body!,
      attributes: (msg.Attributes ?? {}) as Record<string, string>,
    }));
  }

  async deleteMessage(receiptHandle: string): Promise<void> {
    await this.client.send(
      new DeleteMessageCommand({
        QueueUrl: this.wageringQueueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );
  }

  async sendMessage(queueUrl: string, body: string, messageGroupId: string): Promise<string> {
    const response = await this.client.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: body,
        MessageGroupId: messageGroupId,
        MessageDeduplicationId: undefined, // ContentBasedDeduplication handles this
      }),
    );
    return response.MessageId!;
  }

  async sendToDlq(body: string, messageGroupId: string): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.dlqUrl,
        MessageBody: body,
        MessageGroupId: messageGroupId,
      }),
    );
  }

  async isReachable(): Promise<boolean> {
    try {
      await this.client.send(
        new GetQueueAttributesCommand({
          QueueUrl: this.wageringQueueUrl,
          AttributeNames: ['QueueArn'],
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  getWageringQueueUrl(): string {
    return this.wageringQueueUrl;
  }
}
